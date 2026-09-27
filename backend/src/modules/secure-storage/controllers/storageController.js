const fs = require('fs');
const storageService = require('../services/storageService');
const SecureFile = require('../models/SecureFile');
const { logAudit } = require('../../../../utils/auditLogger'); 
const { hasActiveConsent, consentScopeFilter } = require('../../../../middlewares/consentMiddleware');
const { storageProviderFor } = require('../utils/storageProvider');

const isObjectIdString = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

/**
 * resolveStoragePatient
 * @description Secure-Storage-only resolution of a stored SecureFile.patient reference to an EXISTING Patient profile.
 * Supported formats: a Patient._id, or (legacy) the User._id a Patient profile links to via `user`. Read-only: never
 * creates, repairs or rewrites anything. Returns null for a missing / malformed / unresolvable reference. Callers must
 * decide authorization BEFORE acting on the result, so the outcome is never an oracle for unauthorized callers.
 * @returns {Promise<{ patientId: ObjectId, userId: ObjectId|null }|null>}
 */
const resolveStoragePatient = async (ref) => {
    if (!ref || !isObjectIdString(String(ref))) return null;
    const PatientModel = require('../../../../models/Patient');
    const byId = await PatientModel.findById(ref).select('_id user').lean();
    const p = byId || await PatientModel.findOne({ user: ref }).select('_id user').lean();
    return p ? { patientId: p._id, userId: p.user || null } : null;
};

/**
 * authorizeStoragePatient
 * @description The storage access decision for a file's stored patient reference, using the EXISTING consent rule
 * unchanged: hasActiveConsent (patient self / admin / doctor with active, unexpired full_access consent) evaluated
 * against the RESOLVED Patient profile when there is one, otherwise against the raw stored id (which only an
 * administrator can satisfy). A missing/malformed reference is never passed to the consent query.
 */
const authorizeStoragePatient = async (user, ref, resolved) => {
    const input = resolved ? resolved.patientId : (ref && isObjectIdString(String(ref)) ? ref : null);
    if (!input) return !!user && (user.role === 'admin' || user.role === 'hospital_admin');
    return hasActiveConsent({ patientInput: input, requestingUser: user });
};

/**
 * withLinkedUserIds
 * @description Expands a set of (consent-authorized) Patient._ids with the User._ids those same profiles link to, so a
 * legacy SecureFile whose `patient` holds the User._id is matched ONLY when its Patient profile is itself authorized.
 * A User id is never accepted on its own.
 */
const withLinkedUserIds = async (patientIds) => {
    const PatientModel = require('../../../../models/Patient');
    const ids = [...new Set(patientIds.filter(Boolean).map(String))].filter(isObjectIdString);
    if (ids.length === 0) return ids;
    const profiles = await PatientModel.find({ _id: { $in: ids } }).select('user').lean();
    const userIds = profiles.map(p => (p.user ? String(p.user) : null)).filter(Boolean);
    return [...new Set([...ids, ...userIds])];
};

/**
 * linkBelongsToPatient
 * @description True only when the linked record exists and its `patient` is the selected patient (Patient._id, or that
 * patient's User._id for legacy refs). Reads ONLY the `patient` field — no clinical, credential or claim content.
 */
const linkBelongsToPatient = async (modelPath, linkId, patientId) => {
    if (!isObjectIdString(String(linkId)) || !isObjectIdString(String(patientId))) return false;
    const Model = require(modelPath);
    const PatientModel = require('../../../../models/Patient');
    const [doc, patient] = await Promise.all([
        Model.findById(linkId).select('patient').lean(),
        PatientModel.findOne({ $or: [{ _id: patientId }, { user: patientId }] }).select('_id user').lean(),
    ]);
    if (!doc || !doc.patient) return false;
    const owners = new Set([String(patientId)]);
    if (patient) {
        owners.add(String(patient._id));
        if (patient.user) owners.add(String(patient.user));
    }
    return owners.has(String(doc.patient));
};

const LINK_CHECKS = [
    { field: 'linkedEMR', model: '../../../../models/MedicalRecord', label: 'EMR' },
    { field: 'linkedCertificate', model: '../../../../models/Certificate', label: 'certificate' },
    { field: 'linkedInsurance', model: '../../../../models/InsuranceClaim', label: 'insurance claim' },
];

/**
 * resolveOwnerNames
 * @description Display name of each file owner, keyed by the raw SecureFile.patient id. That id is normally a Patient._id
 * (name lives on the linked User); legacy files may hold the User._id directly. Only the name is returned.
 * @param {Array} patientIds - raw SecureFile.patient values
 * @returns {Promise<Map<string,string>>}
 */
const resolveOwnerNames = async (patientIds) => {
    const PatientModel = require('../../../../models/Patient');
    const User = require('../../../../models/User');
    const ids = [...new Set(patientIds.filter(Boolean).map(String))].filter(isObjectIdString);
    const names = new Map();
    if (ids.length === 0) return names;
    const patients = await PatientModel.find({ _id: { $in: ids } }).select('user').populate('user', 'name').lean();
    for (const p of patients) if (p.user && p.user.name) names.set(String(p._id), p.user.name);
    const unresolved = ids.filter(id => !names.has(id));
    if (unresolved.length) {
        const users = await User.find({ _id: { $in: unresolved } }).select('name').lean();
        for (const u of users) if (u.name) names.set(String(u._id), u.name);
    }
    return names;
};

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

        // 2. Every linked record (EMR / certificate / insurance claim) must belong to the selected patient — checked after
        // authorization; nothing has been stored yet, and the `finally` below removes the temp upload.
        for (const { field, model, label } of LINK_CHECKS) {
            const linkId = req.body[field];
            if (linkId && !(await linkBelongsToPatient(model, linkId, patientId))) {
                const message = `The linked ${label} does not belong to the selected patient.`;
                return res.status(400).json({ success: false, message, error: message });
            }
        }

        const { secureFile, ipfsCid, transactionHash, dataHash, blockchainStatus } = await storageService.uploadSecurePayload({
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

        // Blockchain anchoring for a freshly uploaded file is ASYNC (blockchainWorker.js picks it up from the
        // 'pending' queue afterwards) — at the moment this response is built, no commit/reveal has been attempted
        // yet, so the message must not claim anchoring already happened. `blockchainStatus` is the same
        // authoritative FileVersion field the worker and the read-path status checks use; the message reflects
        // whatever it actually is (almost always 'pending' here, but never assumed/hardcoded).
        const blockchainMessage = {
            confirmed: 'Document securely uploaded and anchored to blockchain successfully',
            pending: 'Document securely uploaded; blockchain anchoring is pending',
            processing: 'Document securely uploaded; blockchain anchoring is in progress',
            failed: 'Document securely uploaded; blockchain anchoring failed',
        }[blockchainStatus] || 'Document securely uploaded; blockchain anchoring status pending';

        res.status(201).json({
            success: true,
            message: blockchainMessage,

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
                    blockchainStatus,
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

        if (!isObjectIdString(String(documentId))) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

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
        if (error.code === 'SECURE_FILE_NOT_FOUND') {
            return res.status(404).json({ success: false, message: 'The requested secure file is missing or unavailable from storage.', error: 'SECURE_FILE_NOT_FOUND' });
        }
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
        if (error.code === 'SECURE_FILE_NOT_FOUND') {
            return res.status(404).json({ success: false, message: 'The requested secure file is missing or unavailable from storage.', error: 'SECURE_FILE_NOT_FOUND' });
        }
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

        // 1. Fetch file to check consent and linked entities. The stored `patient` ref is used raw: populating it
        // yielded null for legacy User-id / dangling refs and crashed on `.patient._id` (HTTP 500).
        if (!isObjectIdString(String(documentId))) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }
        const secureDocRef = await SecureFile.findById(documentId).lean();

        if (!secureDocRef) {
            return res.status(404).json({ success: false, message: 'Secure Document not found' , error: 'Secure Document not found'  });
        }

        // 2. Enforce active consent check before proceeding — the existing rule, against the resolved Patient profile
        // (legacy User-id refs resolve through Patient.user). Decided BEFORE anything reveals whether the ref resolves.
        const owner = await resolveStoragePatient(secureDocRef.patient);
        const isAllowed = await authorizeStoragePatient(req.user, secureDocRef.patient, owner);

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: You do not have active consent to verify this file.' , error: 'Access Denied: You do not have active consent to verify this file.'  });
        }

        // 2b. Authorized, but the file's patient reference resolves to no Patient profile (orphaned/legacy data): report
        // a controlled result instead of verifying content that cannot be attributed to a patient.
        if (!owner) {
            if (logAudit) {
                await logAudit({
                    req,
                    action: 'Verification',
                    resource: secureDocRef.fileType || 'SecureFile',
                    resourceId: documentId,
                    details: { fileId: documentId, role: req.user.role, verified: false, status: 'INVALID_REFERENCE' }
                });
            }
            return res.status(200).json({ success: true, message: 'Operation successful', data: {
                success: true,
                message: "The file's patient reference could not be resolved, so its integrity was not checked.",
                status: 'INVALID_REFERENCE',
                verificationDetails: { verified: false, generatedHash: null, expectedHash: null, onChainDetails: null },
                blockchain: { status: null, transactionHash: null, blockNumber: null },
                storage: { provider: null, versionNumber: null },
                documentDetails: {
                    fileName: secureDocRef.fileName,
                    fileType: secureDocRef.fileType,
                    encryptionMethod: secureDocRef.encryptionMethod,
                    owner: null,
                    uploadDate: secureDocRef.createdAt,
                },
                linkedEntity: { type: null, id: null },
            } });
        }

        // 3. Delegate to storageService (no duplication of core logic)
        const result = await storageService.verifyIntegrity(documentId);

        // 4. Linked entity — reference only (type + id). The linked EMR / certificate / claim document itself is NOT
        // returned: verification needs no clinical, credential or claim content.
        let entityType = null;
        let entityId = null;
        if (secureDocRef.linkedEMR) {
            entityType = 'EMR';
            entityId = secureDocRef.linkedEMR;
        } else if (secureDocRef.linkedCertificate) {
            entityType = 'MedicalCertificate';
            entityId = secureDocRef.linkedCertificate;
        } else if (secureDocRef.linkedInsurance) {
            entityType = 'InsuranceClaim';
            entityId = secureDocRef.linkedInsurance;
        }

        // 4b. Version / anchoring / storage metadata of the version that was just verified (read-only).
        const FileVersion = require('../models/FileVersion');
        const currentVersion = await FileVersion.findOne({ secureFile: documentId, isCurrent: true })
            .select('versionNumber ipfsCid blockchainStatus blockchainTransactionHash createdAt')
            .lean();
        let blockNumber = null;
        if (currentVersion && currentVersion.blockchainTransactionHash) {
            try {
                const blockchainContract = require('../../../../blockchain');
                const provider = blockchainContract && blockchainContract.runner && blockchainContract.runner.provider;
                const receipt = provider ? await provider.getTransactionReceipt(currentVersion.blockchainTransactionHash) : null;
                blockNumber = receipt ? Number(receipt.blockNumber) : null;
            } catch (_) {
                blockNumber = null; // chain unreachable: report unknown rather than guess
            }
        }
        const ownerNames = await resolveOwnerNames([owner.patientId]);

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
            message: result.status === 'VERIFIED' ? 'File is verified and untampered.' :
                     result.status === 'BLOCKCHAIN_PENDING' ? 'File integrity is valid but blockchain anchor is pending.' :
                     result.status === 'BLOCKCHAIN_FAILED' ? 'File integrity is valid but blockchain anchor failed.' :
                     result.status === 'BLOCKCHAIN_RECORD_NOT_FOUND' ? 'File integrity is valid but no blockchain anchor was found.' :
                     result.status === 'SECURE_FILE_NOT_FOUND' ? 'The requested secure file is missing or unavailable from storage.' :
                     'File has been tampered with or integrity check failed.',
            status: result.status,
            verificationDetails: {
                verified: result.verified,
                generatedHash: result.generatedHash,
                expectedHash: result.expectedHash,
                onChainDetails: result.onChainDetails
            },
            blockchain: {
                status: currentVersion ? currentVersion.blockchainStatus : null,
                transactionHash: (currentVersion && currentVersion.blockchainTransactionHash) || null,
                blockNumber,
            },
            storage: {
                provider: storageProviderFor(currentVersion && currentVersion.ipfsCid),
                versionNumber: currentVersion ? currentVersion.versionNumber : null,
            },
            documentDetails: {
                fileName: secureDocRef.fileName,
                fileType: secureDocRef.fileType,
                encryptionMethod: secureDocRef.encryptionMethod,
                owner: ownerNames.get(String(owner.patientId)) || null,
                uploadDate: secureDocRef.createdAt,
            },
            linkedEntity: {
                type: entityType,
                id: entityId
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
            const Doctor = require('../../../../models/Doctor');
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            const docId = doctorDoc ? doctorDoc._id : null;
            
            if (req.query.patientId) {
                const isAllowed = await hasActiveConsent({ patientInput: req.query.patientId, requestingUser: req.user });
                if (!isAllowed) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view files.' });
                }
                const pId = await Patient.findOne({ $or: [{ _id: req.query.patientId }, { user: req.query.patientId }] });
                filter.$or = [{ patient: pId ? pId._id : req.query.patientId }, { patient: req.query.patientId }, ...(pId && pId.user ? [{ patient: pId.user }] : [])];
            } else {
                // Consent is the ONLY source of a doctor's access to patients' files. An assignment
                // (Patient.assignedDoctors / doctor.assignedPatients) is NOT consent, so it is never consulted here.
                const Consent = require('../../../../models/Consent');
                const now = new Date();
                const activeConsents = await Consent.find({
                    $and: [
                        { grantedToRole: 'doctor' },
                        consentScopeFilter('full_access'),
                        { status: 'active' },
                        {
                            $or: [
                                { grantedTo: req.user._id },
                                ...(docId ? [{ grantedToDoctor: docId }] : [])
                            ]
                        },
                        {
                            $or: [
                                { expiresAt: { $gt: now } },
                                { expiresAt: null },
                                { expiresAt: { $exists: false } }
                            ]
                        }
                    ]
                });
                
                const consentedPatientIds = activeConsents.map(c => c.patient ? c.patient.toString() : '');
                const allowedPatientIds = [...new Set(consentedPatientIds)].filter(Boolean);
                
                if (allowedPatientIds.length === 0) {
                    return res.status(200).json({ success: true, message: 'Operation successful', data: { files: [], total: 0, page: parseInt(page), pages: 0 } });
                }
                // Consent-authorized Patient profiles, plus the User ids THOSE profiles link to (legacy file refs).
                filter.patient = { $in: await withLinkedUserIds(allowedPatientIds) };
            }
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

        // Owner display names from the RAW patient refs (the populated `patient` is null for legacy User-id refs).
        const rawRefs = await SecureFile.find({ _id: { $in: files.map(f => f._id) } }).select('patient').lean();
        const rawOwnerById = new Map(rawRefs.map(r => [String(r._id), r.patient ? String(r.patient) : null]));
        const ownerNames = await resolveOwnerNames([...rawOwnerById.values()]);

        const enhancedFiles = files.map(file => {
            const version = fileVersions.find(v => v.secureFile.toString() === file._id.toString());
            const rawOwner = rawOwnerById.get(String(file._id));
            return {
                ...file.toObject(),
                ipfsCid: version ? version.ipfsCid : null,
                transactionHash: version ? version.blockchainTransactionHash : null,
                blockchainStatus: version ? version.blockchainStatus : null,
                versionNumber: version ? version.versionNumber : null,
                storageProvider: version ? storageProviderFor(version.ipfsCid) : null,
                ownerName: (rawOwner && ownerNames.get(rawOwner)) || null,
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
            const Doctor = require('../../../../models/Doctor');
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            const docId = doctorDoc ? doctorDoc._id : null;
            
            if (req.query.patientId) {
                const isAllowed = await hasActiveConsent({ patientInput: req.query.patientId, requestingUser: req.user });
                if (!isAllowed) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view stats.' });
                }
                const pId = await Patient.findOne({ $or: [{ _id: req.query.patientId }, { user: req.query.patientId }] });
                filter.$or = [{ patient: pId ? pId._id : req.query.patientId }, { patient: req.query.patientId }, ...(pId && pId.user ? [{ patient: pId.user }] : [])];
            } else {
                // Consent is the ONLY source of a doctor's access to patients' files. An assignment
                // (Patient.assignedDoctors / doctor.assignedPatients) is NOT consent, so it is never consulted here.
                const Consent = require('../../../../models/Consent');
                const now = new Date();
                const activeConsents = await Consent.find({
                    $and: [
                        { grantedToRole: 'doctor' },
                        consentScopeFilter('full_access'),
                        { status: 'active' },
                        {
                            $or: [
                                { grantedTo: req.user._id },
                                ...(docId ? [{ grantedToDoctor: docId }] : [])
                            ]
                        },
                        {
                            $or: [
                                { expiresAt: { $gt: now } },
                                { expiresAt: null },
                                { expiresAt: { $exists: false } }
                            ]
                        }
                    ]
                });
                
                const consentedPatientIds = activeConsents.map(c => c.patient ? c.patient.toString() : '');
                const allowedPatientIds = [...new Set(consentedPatientIds)].filter(Boolean);
                
                if (allowedPatientIds.length === 0) {
                    return res.status(200).json({ success: true, message: 'Operation successful', data: {
                        totalFiles: 0,
                        anchoredCount: 0,
                        ipfsCount: 0,
                        localFallbackCount: 0,
                        breakdown: { 'EMR': 0, 'MedicalCertificate': 0, 'LabReport': 0, 'Prescription': 0, 'InsuranceClaim': 0, 'General': 0 },
                        originalSizeBytes: 0,
                        encryptedSizeBytes: null
                    } });
                }
                // Consent-authorized Patient profiles, plus the User ids THOSE profiles link to (legacy file refs).
                filter.patient = { $in: await withLinkedUserIds(allowedPatientIds) };
            }
        } else {
            return res.status(403).json({ success: false, message: 'Stats view not permitted for this role.' , error: 'Stats view not permitted for this role.'  });
        }

        const totalFiles = await SecureFile.countDocuments(filter);
        const files = await SecureFile.find(filter).select('_id fileType');
        
        const FileVersion = require('../models/FileVersion');
        const fileVersions = await FileVersion.find({ secureFile: { $in: files.map(f => f._id) }, isCurrent: true });

        // Anchored = the worker stored a reveal tx hash; storage counts are split by the ACTUAL provider of each payload.
        const anchoredCount = fileVersions.filter(v => v.blockchainTransactionHash).length;
        const ipfsCount = fileVersions.filter(v => storageProviderFor(v.ipfsCid) === 'ipfs').length;
        const localFallbackCount = fileVersions.filter(v => storageProviderFor(v.ipfsCid) === 'local_fallback').length;

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
            localFallbackCount,
            breakdown,
            // Real total of FileVersion.fileSize for the current versions. storageService records the ORIGINAL (plaintext)
            // upload size there; the encrypted stored size is not recorded anywhere, so it is reported as unknown (null)
            // rather than estimated.
            originalSizeBytes: fileVersions.reduce((sum, v) => sum + (Number(v.fileSize) || 0), 0),
            encryptedSizeBytes: null
        } });
    } catch (error) {
        console.error('Error in getStorageStats:', error);
        next(error);
    }
};
