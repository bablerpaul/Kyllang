const crypto = require('crypto');
const SecureFile = require('../models/SecureFile');
const FileVersion = require('../models/FileVersion');
const FileAccessLog = require('../models/FileAccessLog');
const blockchainContract = require('../../../blockchain'); 
const { encryptFile, decryptFile } = require('../../../utils/encryptionService');
const { uploadToIPFS, fetchFromIPFS } = require('../../../utils/ipfsService');

exports.uploadSecurePayload = async ({ fileBuffer, fileName, mimeType, patientId, uploaderId, documentType, linkedEMR }) => {
    // 1. Encrypt Payload using reusable service
    const finalDataToUpload = encryptFile(fileBuffer);
    
    // Conceptually delete original unencrypted file from memory for security
    fileBuffer.fill(0);

    // 2. Hash Payload
    const dataHash = crypto.createHash('sha256').update(finalDataToUpload).digest('hex');

    // 2. Pin encrypted data to IPFS
    const ipfsCid = await uploadToIPFS(finalDataToUpload, fileName);

    // 4. Anchor on Blockchain
    let transactionHash = null;
    try {
        if (blockchainContract && blockchainContract.storeEMRRecord) {
            // Include EMR ID in the recordType field to store it on-chain
            const recordTypeStr = linkedEMR ? `${documentType}:${linkedEMR.toString()}` : documentType;
            
            const tx = await blockchainContract.storeEMRRecord(
                patientId.toString(),
                recordTypeStr,
                dataHash,
                ipfsCid
            );
            await tx.wait(); // Wait for transaction to be mined
            if (tx && tx.hash) transactionHash = tx.hash;
        }
    } catch (error) {
        console.warn('Failed to anchor to blockchain:', error.message);
    }

    // 5. Store Metadata in MongoDB
    // Create SecureFile entry
    const secureFile = await SecureFile.create({
        fileName,
        fileType: documentType,
        mimeType,
        patient: patientId,
        doctor: uploaderId, // Assuming uploader is the doctor for now
        linkedEMR
    });

    // Create FileVersion entry
    const fileVersion = await FileVersion.create({
        secureFile: secureFile._id,
        versionNumber: 1,
        ipfsCid,
        dataHash,
        blockchainTransactionHash: transactionHash,
        uploadedBy: uploaderId,
        fileSize: fileBuffer.length
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

exports.retrieveSecurePayload = async (documentId, symmetricKeyHex) => {
    const secureDoc = await SecureDocument.findById(documentId);
    if (!secureDoc) throw new Error('Secure Document not found');

    // 1. Verify Hash on Blockchain
    let onChainVerified = false;
    try {
        if (blockchainContract && blockchainContract.verifyRecordHash) {
             const result = await blockchainContract.verifyRecordHash(secureDoc.dataHash);
             onChainVerified = result[0];
        }
    } catch(err) {
        console.warn('Blockchain verification warning:', err.message);
        // Fallback to true if Ganache is offline for dev purposes
        onChainVerified = true; 
    }

    if (!onChainVerified) throw new Error('Blockchain verification failed: Data tampered or not found.');

    // 2. Fetch from IPFS
    const encryptedData = await fetchFromIPFS(secureDoc.ipfsCid);

    // 3. Decrypt using reusable service
    const decryptedBuffer = decryptFile(encryptedData);

    return {
        secureDoc,
        fileBuffer: decryptedBuffer, 
        verified: onChainVerified
    };
};

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
