const storageService = require('../services/storageService');
const { logAudit } = require('../../../utils/auditLogger'); // Assuming auditLogger exists based on insurance controller

// @desc    Upload a secure document
// @route   POST /api/secure-storage/upload
// @access  Private
exports.uploadDocument = async (req, res) => {
    try {
        const { documentType, patientId, linkedEMR } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ message: 'File is required' });
        }
        
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const mimeType = req.file.mimetype;

        if (!patientId || !documentType || !linkedEMR) {
            return res.status(400).json({ message: 'patientId, documentType, and linkedEMR are required' });
        }

        const { secureFile, ipfsCid, transactionHash, dataHash } = await storageService.uploadSecurePayload({
            fileBuffer,
            fileName,
            mimeType,
            patientId,
            uploaderId: req.user._id,
            documentType,
            linkedEMR
        });

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'CREATED',
                resource: 'SecureFile',
                resourceId: secureFile._id,
                // Note: FileVersion hash would be ideal here if exposed
                details: { type: 'upload_secure_document', documentType, linkedEMR }
            });
        }

        res.status(201).json({
            success: true,
            message: 'Document securely uploaded and anchored',
            metadata: {
                fileId: secureFile._id,
                fileName: secureFile.fileName,
                fileType: secureFile.fileType,
                mimeType: secureFile.mimeType,
                linkedEMR: secureFile.linkedEMR,
                ipfsCid,
                transactionHash,
                dataHash
            }
        });

    } catch (error) {
        console.error('Error in uploadDocument:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Retrieve and verify a secure document
// @route   POST /api/secure-storage/retrieve/:id
// @access  Private
exports.retrieveDocument = async (req, res) => {
    try {
        const documentId = req.params.id;

        const { secureDoc, fileBuffer, verified } = await storageService.retrieveSecurePayload(documentId);

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'VIEWED',
                resource: 'SecureDocument',
                resourceId: secureDoc._id,
                hash: secureDoc.dataHash,
                details: { type: 'retrieve_secure_document', verified }
            });
        }

        // Send decrypted file
        res.setHeader('Content-Type', secureDoc.metadata.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=${secureDoc.metadata.fileName || 'download'}`);
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error in retrieveDocument:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Verify the integrity of a stored document
// @route   GET /api/secure-storage/verify/:id
// @access  Private
exports.verifyIntegrity = async (req, res) => {
    try {
        const documentId = req.params.id;

        const result = await storageService.verifyIntegrity(documentId);

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'VIEWED',
                resource: 'SecureFile',
                resourceId: documentId,
                hash: result.generatedHash,
                details: { type: 'verify_integrity', verified: result.verified }
            });
        }

        res.status(200).json({
            success: true,
            message: result.verified ? 'File is verified and untampered.' : 'File has been tampered with or not found on-chain.',
            ...result
        });
    } catch (error) {
        console.error('Error in verifyIntegrity:', error);
        res.status(500).json({ message: error.message });
    }
};
