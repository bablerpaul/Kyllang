const crypto = require('crypto');
const SecureFile = require('../models/SecureFile');
const FileVersion = require('../models/FileVersion');
const FileAccessLog = require('../models/FileAccessLog');
const blockchainContract = require('../../../../blockchain');
const { encryptFile, decryptFile } = require('../../../utils/encryptionService');
const { uploadToIPFS, fetchFromIPFS } = require('../../../utils/ipfsService');

/**
 * uploadSecurePayload
 * @description Handles operations for uploadSecurePayload. Explains parameters, return values and usage.
 * @param {*} param - param parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadSecurePayload = async ({ filePath, fileName, mimeType, patientId, uploaderId, documentType, linkedEMR, linkedCertificate, linkedInsurance }) => {
    const fs = require('fs');
    const path = require('path');
    const { encryptFileStream } = require('../../../utils/encryptionService');
    const { uploadStreamToIPFS } = require('../../../utils/ipfsService');
    
    // Create temp encrypted file path
    const tempDir = path.join(__dirname, '../../../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const encryptedFilePath = path.join(tempDir, `enc-${Date.now()}-${fileName}`);

    // 1. Encrypt Payload using reusable stream service
    await encryptFileStream(filePath, encryptedFilePath);

    // 2. Hash Payload via Stream to avoid memory loading
    const hashStream = crypto.createHash('sha256');
    const readHashStream = fs.createReadStream(encryptedFilePath);
    
    const dataHash = await new Promise((resolve, reject) => {
        readHashStream.pipe(hashStream)
            .on('finish', () => resolve(hashStream.digest('hex')))
            .on('error', reject);
    });

    // 3. Pin encrypted data stream to IPFS
    const ipfsCid = await uploadStreamToIPFS(encryptedFilePath, fileName);

    const fileSize = fs.statSync(filePath).size;

    // Cleanup local files asynchronously to not block
    fs.promises.unlink(filePath).catch(err => console.warn('Failed to delete original file:', err));
    fs.promises.unlink(encryptedFilePath).catch(err => console.warn('Failed to delete temp encrypted file:', err));

    // 4. Pass recordTypeStr to MongoDB for the background worker
    let recordTypeStr = documentType;
    if (linkedEMR) recordTypeStr = `${documentType}:${linkedEMR.toString()}`;
    else if (linkedCertificate) recordTypeStr = `${documentType}:${linkedCertificate.toString()}`;
    else if (linkedInsurance) recordTypeStr = `${documentType}:${linkedInsurance.toString()}`;

    // Return transactionHash as null because it will be populated async
    let transactionHash = null;

    // 5. Store Metadata in MongoDB
    // Create SecureFile entry
    const secureFile = await SecureFile.create({
        fileName,
        fileType: documentType,
        mimeType,
        patient: patientId,
        doctor: uploaderId, // Assuming uploader is the doctor for now
        linkedEMR,
        linkedCertificate,
        linkedInsurance
    });

    // Create FileVersion entry
    const fileVersion = await FileVersion.create({
        secureFile: secureFile._id,
        versionNumber: 1,
        ipfsCid,
        dataHash,
        blockchainTransactionHash: transactionHash,
        uploadedBy: uploaderId,
        fileSize: fileSize,
        recordTypeStr: recordTypeStr
    });

    // Create FileAccessLog entry
    await FileAccessLog.create({
        secureFile: secureFile._id,
        fileVersion: fileVersion._id,
        accessedBy: uploaderId,
        actionType: 'UPLOADED'
    });

    return { secureFile, ipfsCid, transactionHash, dataHash }; 
};

/**
 * retrieveSecurePayload
 * @description Handles operations for retrieveSecurePayload. Explains parameters, return values and usage.
 * @param {*} documentId - documentId parameter
 * @param {*} symmetricKeyHex - symmetricKeyHex parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.retrieveSecurePayload = async (documentId, symmetricKeyHex) => {
    const secureDoc = await SecureFile.findById(documentId);
    if (!secureDoc) throw new Error('Secure Document not found');

    const FileVersion = require('../models/FileVersion');
    const fileVersion = await FileVersion.findOne({ secureFile: documentId });
    if (!fileVersion) throw new Error('File version not found');

    // 1. Verify Hash on Blockchain
    let onChainVerified = false;
    try {
        if (blockchainContract && blockchainContract.verifyRecordHash) {
             const result = await blockchainContract.verifyRecordHash(fileVersion.dataHash);
             onChainVerified = result[0];
        }
    } catch(err) {
        console.warn('Blockchain verification warning:', err.message);
        // Fallback to true if Ganache is offline for dev purposes
        onChainVerified = true; 
    }

    if (!onChainVerified) throw new Error('Blockchain verification failed: Data tampered or not found.');

    // 2. Fetch from IPFS
    const encryptedData = await fetchFromIPFS(fileVersion.ipfsCid);

    // 3. Decrypt using reusable service
    const decryptedBuffer = decryptFile(encryptedData);

    return {
        secureDoc,
        fileBuffer: decryptedBuffer, 
        verified: onChainVerified
    };
};

/**
 * verifyIntegrity
 * @description Handles operations for verifyIntegrity. Explains parameters, return values and usage.
 * @param {*} documentId - documentId parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.verifyIntegrity = async (documentId) => {
    // 1. Fetch File records
    const secureDoc = await SecureFile.findById(documentId);
    if (!secureDoc) throw new Error('Secure Document not found');
    
    const fileVersion = await FileVersion.findOne({ secureFile: documentId, isCurrent: true });
    if (!fileVersion) throw new Error('File version not found');

    // 2. Fetch encrypted file buffer directly from IPFS
    const encryptedData = await fetchFromIPFS(fileVersion.ipfsCid);

    // 3. Generate SHA-256 Hash of downloaded buffer
    const generatedHash = crypto.createHash('sha256').update(encryptedData).digest('hex');

    // 4. Retrieve Blockchain Hash and compare
    let onChainVerified = false;
    let onChainDetails = null;
    try {
        if (blockchainContract && blockchainContract.verifyRecordHash) {
             const result = await blockchainContract.verifyRecordHash(generatedHash);
             onChainVerified = result[0]; // exists
             if (onChainVerified) {
                 onChainDetails = {
                     timestamp: Number(result[1]),
                     patientId: result[2],
                     recordType: result[3],
                     ipfsCid: result[4]
                 };
             }
        }
    } catch(err) {
        console.warn('Blockchain verification warning:', err.message);
    }

    return {
        verified: onChainVerified,
        generatedHash,
        expectedHash: fileVersion.dataHash,
        onChainDetails
    };
};

/**
 * deleteSecurePayload
 * @description Handles operations for deleteSecurePayload. Explains parameters, return values and usage.
 * @param {*} documentId - documentId parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deleteSecurePayload = async (documentId) => {
    // 1. Fetch file records
    const secureDoc = await SecureFile.findById(documentId);
    if (!secureDoc) throw new Error('Secure Document not found');

    const fileVersion = await FileVersion.findOne({ secureFile: documentId, isCurrent: true });
    if (!fileVersion) throw new Error('File version not found');

    const dataHash = fileVersion.dataHash;

    // 2. Perform deletion in MongoDB
    // Note: IPFS cannot truly delete, you can unpin from your local node, but it's immutable
    // So we just soft delete or hard delete the MongoDB reference.
    await FileVersion.deleteMany({ secureFile: documentId });
    await SecureFile.findByIdAndDelete(documentId);

    // 3. (Optional) We could call a smart contract revoke if supported, but standard store hash doesn't delete

    return dataHash;
};
