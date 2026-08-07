const fs = require('fs');
const storageService = require('../services/storageService');
const SecureFile = require('../models/SecureFile');
const { logAudit } = require('../../../../utils/auditLogger'); 
const { hasActiveConsent } = require('../../../../middlewares/consentMiddleware');

/**
 * uploadDocument
 * @description Handles operations for uploadDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadDocument = async (req, res, next) => {
    try {
        const { documentType, patientId, linkedEMR, linkedCertificate, linkedInsurance } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File is required' , error: 'File is required'  });
        }
        
        const filePath = req.file.path;
        const fileName = req.file.originalname;
        const mimeType = req.file.mimetype;

        // Validation for linked IDs is now handled by the validateUploadLinks middleware

        // 1. Enforce active consent check for uploading to this patient
        const isAllowed = await hasActiveConsent({
            patientInput: patientId,
            requestingUser: req.user
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to upload files for this patient.' , error: 'Access Denied: You do not have active consent to upload files for this patient.'  });
        }

        const { secureFile, ipfsCid, transactionHash, dataHash } = await storageService.uploadSecurePayload({
            filePath,
            fileName,
            mimeType,
            patientId,
            uploaderId: req.user._id,
            documentType,
            linkedEMR,
            linkedCertificate,
            linkedInsurance
        });

        // Audit Log
        if (logAudit) {
            let actionType = 'UPLOAD';
            if (documentType === 'EMR') actionType = 'EMR Upload';
            else if (documentType === 'MedicalCertificate') actionType = 'Certificate Upload';
            else if (documentType === 'InsuranceClaim') actionType = 'Insurance Upload';
            else actionType = `${documentType} Upload`;

            await logAudit({
                req,
                action: actionType,
                resource: documentType || 'SecureFile',
                resourceId: secureFile._id,
                hash: dataHash,
                blockchainTransaction: transactionHash,
                details: { 
                    fileId: secureFile._id, 
                    role: req.user.role, 
                    patientId, 
                    documentType 
                }
            });
        }

        res.status(201).json({
            success: true,
            message: 'Document securely uploaded and anchored',

            data: {
                metadata: {
                    fileId: secureFile._id,
                    fileName: secureFile.fileName,
                    fileType: secureFile.fileType,
                    mimeType: secureFile.mimeType,
                    linkedEMR: secureFile.linkedEMR,
                    linkedCertificate: secureFile.linkedCertificate,
                    linkedInsurance: secureFile.linkedInsurance,
                    ipfsCid,
                    transactionHash,
                    dataHash
                }
            }
        });

    } catch (error) {
        console.error('Error in uploadDocument:', error);
        next(error);
    } finally {
        if (req.file && req.file.path) {
            fs.promises.unlink(req.file.path).catch(err => console.error('Error deleting temp file:', err));
        }
    }
};

/**
 * downloadDocument
 * @description Handles operations for downloadDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.downloadDocument = async (req, res, next) => {
    try {
        const documentId = req.params.id;

        // 1. Fetch file to check consent
        const secureDocRef = await SecureFile.findById(documentId);
        if (!secureDocRef) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

        // 2. Enforce active consent check before proceeding
        const isAllowed = await hasActiveConsent({
            patientInput: secureDocRef.patient,
            requestingUser: req.user
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to access this file.' , error: 'Access Denied: You do not have active consent to access this file.'  });
        }

        const { secureDoc, fileBuffer, verified } = await storageService.retrieveSecurePayload(documentId);

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'Download',
                resource: secureDoc.fileType || 'SecureFile',
                resourceId: documentId,
                hash: secureDoc.dataHash,
                details: { 
                    fileId: documentId,
                    role: req.user.role
                }
            });
        }

        // Send decrypted file
        res.setHeader('Content-Type', secureDoc.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=${secureDoc.fileName || 'download'}`);
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error in downloadDocument:', error);
        next(error);
    }
};

/**
 * viewDocument
 * @description Handles operations for viewDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.viewDocument = async (req, res, next) => {
    try {
        const documentId = req.params.id;

        // 1. Fetch file to check consent
        const secureDocRef = await SecureFile.findById(documentId);
        if (!secureDocRef) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

        // 2. Enforce active consent check before proceeding
        const isAllowed = await hasActiveConsent({
            patientInput: secureDocRef.patient,
            requestingUser: req.user
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to access this file.' , error: 'Access Denied: You do not have active consent to access this file.'  });
        }

        const { secureDoc, fileBuffer } = await storageService.retrieveSecurePayload(documentId);

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'VIEW',
                resource: 'SecureFile',
                resourceId: documentId,
                hash: secureDoc.dataHash,
                details: { 
                    fileId: documentId,
                    role: req.user.role
                }
            });
        }

        // Send decrypted file for inline viewing
        res.setHeader('Content-Type', secureDoc.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename=${secureDoc.fileName || 'view'}`);
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error in viewDocument:', error);
        next(error);
    }
};

/**
 * verifyIntegrity
 * @description Handles operations for verifyIntegrity. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.verifyIntegrity = async (req, res, next) => {
    try {
        const documentId = req.params.id;

        // 1. Fetch file to check consent and linked entities
        const secureDocRef = await SecureFile.findById(documentId)
            .populate('patient', 'name email')
            .populate('doctor', 'name email');

        if (!secureDocRef) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

        // 2. Enforce active consent check before proceeding
        const isAllowed = await hasActiveConsent({
            patientInput: secureDocRef.patient._id,
            requestingUser: req.user
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to verify this file.' , error: 'Access Denied: You do not have active consent to verify this file.'  });
        }

        // 3. Delegate to storageService (no duplication of core logic)
        const result = await storageService.verifyIntegrity(documentId);

        // 4. Retrieve appropriate linked entity automatically
        let linkedEntity = null;
        let entityType = null;
        if (secureDocRef.linkedEMR) {
            const MedicalRecord = require('../../../../models/MedicalRecord');
            linkedEntity = await MedicalRecord.findById(secureDocRef.linkedEMR).lean();
            entityType = 'EMR';
        } else if (secureDocRef.linkedCertificate) {
            const Certificate = require('../../../../models/Certificate');
            linkedEntity = await Certificate.findById(secureDocRef.linkedCertificate).lean();
            entityType = 'MedicalCertificate';
        } else if (secureDocRef.linkedInsurance) {
            const InsuranceClaim = require('../../../../models/InsuranceClaim');
            linkedEntity = await InsuranceClaim.findById(secureDocRef.linkedInsurance).lean();
            entityType = 'InsuranceClaim';
        }

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'Verification',
                resource: secureDocRef.fileType || 'SecureFile',
                resourceId: documentId,
                hash: result.generatedHash,
                details: { 
                    fileId: documentId,
                    role: req.user.role,
                    verified: result.verified 
                }
            });
        }

        // 5. Generate Verification Report
        const verificationReport = {
            success: true,
            message: result.verified ? 'File is verified and untampered.' : 'File has been tampered with or not found on-chain.',
            verificationDetails: {
                verified: result.verified,
                generatedHash: result.generatedHash,
                expectedHash: result.expectedHash,
                onChainDetails: result.onChainDetails
            },
            documentDetails: {
                fileName: secureDocRef.fileName,
                fileType: secureDocRef.fileType,
                encryptionMethod: secureDocRef.encryptionMethod,
                owner: secureDocRef.patient?.name,
                uploadDate: secureDocRef.createdAt,
            },
            linkedEntity: {
                type: entityType,
                data: linkedEntity
            }
        };

        res.status(200).json({ success: true, message: 'Operation successful', data: verificationReport });
    } catch (error) {
        console.error('Error in verifyIntegrity:', error);
        next(error);
    }
};

/**
 * deleteDocument
 * @description Handles operations for deleteDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deleteDocument = async (req, res, next) => {
    try {
        const documentId = req.params.id;

        // 1. Fetch file to check consent
        const secureDocRef = await SecureFile.findById(documentId);
        if (!secureDocRef) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

        // 2. Enforce active consent check
        const isAllowed = await hasActiveConsent({
            patientInput: secureDocRef.patient,
            requestingUser: req.user
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to delete this file.' , error: 'Access Denied: You do not have active consent to delete this file.'  });
        }

        const dataHash = await storageService.deleteSecurePayload(documentId);

        // Audit Log
        if (logAudit) {
            await logAudit({
                req,
                action: 'Delete',
                resource: secureDocRef.fileType || 'SecureFile',
                resourceId: documentId,
                hash: dataHash,
                details: { 
                    fileId: documentId,
                    role: req.user.role
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Document deleted successfully',
            data: {}
        });
    } catch (error) {
        console.error('Error in deleteDocument:', error);
        next(error);
    }
};

const Patient = require('../../../../models/Patient'); // Needed to check doctor assignments if not done by consent logic?
/**
 * listFiles
 * @description Handles operations for listFiles. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.listFiles = async (req, res, next) => {
    try {
        const { search, documentType, page = 1, limit = 10 } = req.query;
        let filter = { isActive: true };

        // Role-based filtering
        if (req.user.role === 'admin' || req.user.role === 'hospital_admin') {
            // Full access, no extra filter
        } else if (req.user.role === 'patient' || req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ $or: [{ _id: req.user._id }, { user: req.user._id }] });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter.$or = [{ patient: pId }, { patient: req.user._id }];
        } else if (req.user.role === 'doctor') {
            const patients = await Patient.find({ assignedDoctors: req.user._id });
            const patientIds = patients.map(p => p._id);
            filter.patient = { $in: patientIds };
        } else {
            // Insurance or other roles would ideally use an explicit consent check table,
            // but for simplicity, we return empty list if not explicitly permitted unless they search by ID
            return res.status(403).json({ success: false, message: 'List view not permitted for this role.' , error: 'List view not permitted for this role.'  });
        }

        if (documentType && documentType !== 'All') {
            filter.fileType = documentType;
        }

        if (search) {
            filter.fileName = { $regex: search, $options: 'i' };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const totalFiles = await SecureFile.countDocuments(filter);
        const files = await SecureFile.find(filter)
            .populate('patient', 'name user')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Fetch IPFS CID and Hash details for each file
        const FileVersion = require('../models/FileVersion');
        const fileVersions = await FileVersion.find({ secureFile: { $in: files.map(f => f._id) }, isCurrent: true });
        
        const enhancedFiles = files.map(file => {
            const version = fileVersions.find(v => v.secureFile.toString() === file._id.toString());
            return {
                ...file.toObject(),
                ipfsCid: version ? version.ipfsCid : null,
                transactionHash: version ? version.blockchainTransactionHash : null
            };
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            files: enhancedFiles,
            total: totalFiles,
            page: parseInt(page),
            pages: Math.ceil(totalFiles / limit)
        } });
    } catch (error) {
        console.error('Error in listFiles:', error);
        next(error);
    }
};

/**
 * getStorageStats
 * @description Handles operations for getStorageStats. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getStorageStats = async (req, res, next) => {
    try {
        let filter = { isActive: true };

        // Similar role-based filtering for stats
        if (req.user.role === 'admin' || req.user.role === 'hospital_admin') {
            // Full access
        } else if (req.user.role === 'patient' || req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ $or: [{ _id: req.user._id }, { user: req.user._id }] });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter.$or = [{ patient: pId }, { patient: req.user._id }];
        } else if (req.user.role === 'doctor') {
            const patients = await Patient.find({ assignedDoctors: req.user._id });
            const patientIds = patients.map(p => p._id);
            filter.patient = { $in: patientIds };
        } else {
            return res.status(403).json({ success: false, message: 'Stats view not permitted for this role.' , error: 'Stats view not permitted for this role.'  });
        }

        const totalFiles = await SecureFile.countDocuments(filter);
        const files = await SecureFile.find(filter).select('_id fileType');
        
        const FileVersion = require('../models/FileVersion');
        const fileVersions = await FileVersion.find({ secureFile: { $in: files.map(f => f._id) }, isCurrent: true });

        const anchoredCount = fileVersions.filter(v => v.transactionHash).length;
        const ipfsCount = fileVersions.filter(v => v.ipfsCid).length;

        // Breakdown
        const breakdown = {
            'EMR': 0, 'MedicalCertificate': 0, 'LabReport': 0, 'Prescription': 0, 'InsuranceClaim': 0, 'General': 0
        };

        files.forEach(f => {
            if (breakdown[f.fileType] !== undefined) {
                breakdown[f.fileType]++;
            } else {
                breakdown['General']++;
            }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            totalFiles,
            anchoredCount,
            ipfsCount,
            breakdown,
            encryptedSizeApproximation: `${(totalFiles * 2.5).toFixed(1)} MB` // Mock size approximation
        } });
    } catch (error) {
        console.error('Error in getStorageStats:', error);
        next(error);
    }
};
