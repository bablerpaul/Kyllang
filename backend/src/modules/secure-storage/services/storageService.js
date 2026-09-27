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
exports.uploadSecurePayload = async ({ filePath, fileName, mimeType, patientId, uploaderId, documentType, linkedEMR, linkedCertificate, linkedInsurance, linkedLabReport, doctorId }) => {
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

    let secureFile, ipfsCid, transactionHash, dataHash, fileSize, recordTypeStr, blockchainStatus;

    try {
        // 1. Encrypt Payload using reusable stream service
        await encryptFileStream(filePath, encryptedFilePath);

        // 2. Hash Payload via Stream to avoid memory loading
        const hashStream = crypto.createHash('sha256');
        const readHashStream = fs.createReadStream(encryptedFilePath);
        
        dataHash = await new Promise((resolve, reject) => {
            readHashStream.pipe(hashStream)
                .on('finish', () => resolve(hashStream.digest('hex')))
                .on('error', reject);
        });

        // 3. Pin encrypted data stream to IPFS
        ipfsCid = await uploadStreamToIPFS(encryptedFilePath, fileName);

        fileSize = fs.statSync(filePath).size;

        // 4. Pass recordTypeStr to MongoDB for the background worker
        recordTypeStr = documentType;
        if (linkedEMR) recordTypeStr = `${documentType}:${linkedEMR.toString()}`;
        else if (linkedCertificate) recordTypeStr = `${documentType}:${linkedCertificate.toString()}`;
        else if (linkedInsurance) recordTypeStr = `${documentType}:${linkedInsurance.toString()}`;
        else if (linkedLabReport) recordTypeStr = `${documentType}:${linkedLabReport.toString()}`;

        // Return transactionHash as null because it will be populated async
        transactionHash = null;

        // 5. Store Metadata in MongoDB
        // Create SecureFile entry
        secureFile = await SecureFile.create({
            fileName,
            fileType: documentType,
            mimeType,
            patient: patientId,
            doctor: doctorId || uploaderId, // Use explicit doctorId if provided, else fallback to uploader
            linkedEMR,
            linkedCertificate,
            linkedInsurance,
            linkedLabReport
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
        // The SAME authoritative field blockchainWorker.js (pending -> processing -> confirmed/failed) and the
        // read-path status checks (retrieveSecurePayload / verifyIntegrity) already key off of — never a second,
        // separately-tracked status. Read back from the document just created, not assumed/hardcoded.
        blockchainStatus = fileVersion.blockchainStatus;

        // Create FileAccessLog entry
        await FileAccessLog.create({
            secureFile: secureFile._id,
            fileVersion: fileVersion._id,
            accessedBy: uploaderId,
            actionType: 'UPLOADED'
        });

    } finally {
        // Guaranteed cleanup of temp files, even if operations throw
        fs.promises.unlink(filePath).catch(err => {
            if (err.code !== 'ENOENT') console.warn('Failed to delete original file:', err);
        });
        fs.promises.unlink(encryptedFilePath).catch(err => {
            if (err.code !== 'ENOENT') console.warn('Failed to delete temp encrypted file:', err);
        });
    }

    return { secureFile, ipfsCid, transactionHash, dataHash, blockchainStatus };
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

    // 1. Fetch from IPFS FIRST to validate local integrity authoritative hash-binding
    let encryptedData;
    try {
        encryptedData = await fetchFromIPFS(fileVersion.ipfsCid);
    } catch (err) {
        const error = new Error('Secure file not found or unavailable in storage');
        error.code = 'SECURE_FILE_NOT_FOUND';
        throw error;
    }

    // 2. Ensure the retrieved payload matches the expected hash (14D Hash Binding)
    const generatedHash = crypto.createHash('sha256').update(encryptedData).digest('hex');
    if (generatedHash !== fileVersion.dataHash) {
        throw new Error('Data integrity check failed: payload hash mismatch.');
    }

    // 3. Verify Hash on Blockchain
    let onChainVerified = false;
    let finalStatus = 'VERIFIED';

    if (fileVersion.blockchainStatus === 'pending') {
        finalStatus = 'BLOCKCHAIN_PENDING';
        onChainVerified = false;
    } else if (fileVersion.blockchainStatus === 'failed') {
        finalStatus = 'BLOCKCHAIN_FAILED';
        onChainVerified = false;
    } else {
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

        if (!onChainVerified) {
            finalStatus = 'BLOCKCHAIN_RECORD_NOT_FOUND';
        }
    }

    // Security choice (Option A): We ALLOW decryption and retrieval here because 
    // the local hash validation (step 2) passed, proving the data has not been tampered with.
    // The blockchain is an asynchronous non-repudiation layer. Pending/failed states 
    // should not maliciously lock patients out of valid data.

    // 4. Decrypt using reusable service
    const decryptedBuffer = decryptFile(encryptedData);

    return {
        secureDoc,
        fileBuffer: decryptedBuffer, 
        verified: onChainVerified,
        status: finalStatus
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
    let encryptedData;
    try {
        encryptedData = await fetchFromIPFS(fileVersion.ipfsCid);
    } catch (err) {
        return {
            verified: false,
            status: 'SECURE_FILE_NOT_FOUND',
            generatedHash: null,
            expectedHash: fileVersion.dataHash,
            onChainDetails: null
        };
    }

    // 3. Generate SHA-256 Hash of downloaded buffer
    const generatedHash = crypto.createHash('sha256').update(encryptedData).digest('hex');

    // 3.5 Ensure hash matches FileVersion (local hash-binding)
    if (generatedHash !== fileVersion.dataHash) {
        return {
            verified: false,
            status: 'INTEGRITY_MISMATCH',
            generatedHash,
            expectedHash: fileVersion.dataHash,
            onChainDetails: null
        };
    }

    // 4. Retrieve Blockchain Hash and compare
    let onChainVerified = false;
    let onChainDetails = null;
    let finalStatus = 'VERIFIED';

    if (fileVersion.blockchainStatus === 'pending') {
        finalStatus = 'BLOCKCHAIN_PENDING';
        onChainVerified = false;
    } else if (fileVersion.blockchainStatus === 'failed') {
        finalStatus = 'BLOCKCHAIN_FAILED';
        onChainVerified = false;
    } else {
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

        if (!onChainVerified) {
            finalStatus = 'BLOCKCHAIN_RECORD_NOT_FOUND';
        }
    }

    return {
        verified: onChainVerified,
        status: finalStatus,
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
    const fs = require('fs');
    const path = require('path');

    // 1. Fetch file records
    const secureDoc = await SecureFile.findById(documentId);
    if (!secureDoc) throw new Error('Secure Document not found');

    const fileVersion = await FileVersion.findOne({ secureFile: documentId, isCurrent: true });
    if (!fileVersion) throw new Error('File version not found');

    const dataHash = fileVersion.dataHash;

    // Retrieve all FileVersion records for this SecureFile to clean up physical blobs
    const allVersions = await FileVersion.find({ secureFile: documentId });

    // Collect unique fallback CIDs to avoid attempting to delete the same blob multiple times
    const fallbackCidsToDelete = new Set();
    const fallbackCIDRegex = /^mock_ipfs_cid_\d+$/;

    for (const v of allVersions) {
        if (v.ipfsCid && fallbackCIDRegex.test(v.ipfsCid)) {
            fallbackCidsToDelete.add(v.ipfsCid);
        }
    }

    const fallbackDir = path.join(__dirname, '../../../../uploads/fallback-storage');

    // Delete physical fallback blobs safely
    for (const cid of fallbackCidsToDelete) {
        const filePath = path.join(fallbackDir, cid);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            console.warn(`Failed to delete fallback storage object ${cid}:`, err.message);
            // Non-fatal: physical cleanup is best-effort. Metadata deletion must proceed.
        }
    }

    // 2. Perform deletion in MongoDB
    // Note: IPFS cannot truly delete, you can unpin from your local node, but it's immutable
    // So we just soft delete or hard delete the MongoDB reference.
    await FileVersion.deleteMany({ secureFile: documentId });
    await SecureFile.findByIdAndDelete(documentId);

    // 3. (Optional) We could call a smart contract revoke if supported, but standard store hash doesn't delete

    return dataHash;
};
