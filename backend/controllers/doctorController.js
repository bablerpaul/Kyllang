const User = require('../models/User');
const fs = require('fs');
const Certificate = require('../models/Certificate');
const PatientDocument = require('../models/PatientDocument');
const AuditLog = require('../models/AuditLog');
const MedicalRecord = require('../models/MedicalRecord');
const Doctor = require('../models/Doctor');

const blockchainContract = require('../blockchain');
const { resolvePatientProfile } = require('../services/certificatePatientService');
const storageService = require('../src/modules/secure-storage/services/storageService');

/**
 * getPatients
 * @description Handles operations for getPatients. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPatients = async (req, res, next) => {
    try {
        const doctor = await User.findById(req.user._id).populate('assignedPatients', 'name email').lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' , error: 'Doctor not found'  });
        }

        res.status(200).json({ success: true, message: 'Operation successful', data: doctor.assignedPatients });
    } catch (error) {
        next(error);
    }
};

/**
 * getPatientDocuments
 * @description Handles operations for getPatientDocuments. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPatientDocuments = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const doctorId = req.user._id;
        
        const { hasActiveConsent } = require('../middlewares/consentMiddleware');
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view documents.' });
        }

        const documents = await PatientDocument.find({ patient: patientId });

        const mappedDocs = documents.map((doc) => {
            const hasAccess = doc.accessList.some((access) => {
                return access.doctor.toString() === doctorId.toString() &&
                    new Date() < new Date(access.expiresAt);
            });

            const hasPendingRequest = doc.accessRequests.some(
                (req) => req.doctor.toString() === doctorId.toString()
            );

            if (hasAccess) {
                const accessDetail = doc.accessList.find(a => a.doctor.toString() === doctorId.toString());
                return {
                    _id: doc._id,
                    title: doc.title,
                    type: doc.type,
                    createdAt: doc.createdAt,
                    hasAccess: true,
                    encryptedData: doc.encryptedData,
                    doctorEncryptedKey: accessDetail.doctorEncryptedKey,
                    expiresAt: accessDetail.expiresAt,
                };
            } else {
                return {
                    _id: doc._id,
                    title: doc.title,
                    type: doc.type,
                    createdAt: doc.createdAt,
                    hasAccess: false,
                    hasPendingRequest,
                };
            }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: mappedDocs });
    } catch (error) {
        next(error);
    }
};

/**
 * requestDocumentAccess
 * @description Handles operations for requestDocumentAccess. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.requestDocumentAccess = async (req, res, next) => {
    try {
        const doc = await PatientDocument.findById(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' , error: 'Document not found'  });

        const doctorId = req.user._id;

        // Check if already requested
        const alreadyRequested = doc.accessRequests.some(r => r.doctor.toString() === doctorId.toString());
        if (alreadyRequested) {
            return res.status(400).json({ success: false, message: 'Already requested access' , error: 'Already requested access'  });
        }

        doc.accessRequests.push({ doctor: doctorId });
        await doc.save();

        await AuditLog.create({
            actor: doctorId,
            action: 'OTHER',
            details: { type: 'request_document_access', documentId: doc._id }
        });

        res.status(200).json({ success: true, message: 'Access requested successfully' , data: { } });
    } catch (error) {
        next(error);
    }
};

const crypto = require('crypto');

/**
 * issueCertificate
 * @description Handles operations for issueCertificate. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
/**
 * issueCertificate — RETIRED (Step 78).
 * This legacy HMAC-based issuance path predates the current ZK/CertificateRegistry architecture and was found
 * (Step 77 audit) to be permanently broken end-to-end: it called a nonexistent blockchainContract.storeEMRRecord
 * method (silently swallowed) and then always failed Certificate schema validation (publicCommitmentHash is
 * required and was never set), while still creating a stray MedicalRecord before that failure. It also never
 * enforced the current certificate consent model. No frontend caller uses this route (confirmed by repo-wide
 * search) — the canonical path is POST /api/certificates -> certificateController.js::createCertificate, which
 * this change does not touch. The route stays authenticated/reachable but now performs NO database, blockchain,
 * or file-system work — it only reports that it is retired.
 */
exports.issueCertificate = async (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'LEGACY_CERTIFICATE_ENDPOINT_RETIRED',
        message: 'This certificate issuance endpoint has been retired. Use POST /api/certificates instead.',
    });
};
/**
 * getDocument
 * @description Handles operations for getDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getDocument = async (req, res, next) => {
    try {
        const doc = await PatientDocument.findById(req.params.docId).populate('patient', 'name').lean();
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' , error: 'Document not found'  });

        const doctorId = req.user._id;

        // KYLLANG_V4: π_session gate — block offline collusion (fixes Flaw 4)
        // Hard-blocking in production, pass-through in dev if contract not available
        const { generateLookupToken } = require('../services/vrfService');
        const { verifySessionOnChain } = require('../proxy-nodes/session-proof-verifier');
        const vrfToken = await generateLookupToken(doc.patient._id);
        const sessionValid = await verifySessionOnChain(vrfToken, req.user.walletAddress || req.user._id);

        if (process.env.NODE_ENV === 'production' && !sessionValid) {
            return res.status(403).json({
                success: false,
                message: 'No active on-chain session proof found',
                error: 'π_session validation failed'
            });
        }


        const hasAccess = doc.accessList.some((access) => {
            return access.doctor.toString() === doctorId.toString() &&
                new Date() < new Date(access.expiresAt);
        });

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'No active access to this document' , error: 'No active access to this document'  });
        }

        const accessDetail = doc.accessList.find(a => a.doctor.toString() === doctorId.toString());

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            _id: doc._id,
            title: doc.title,
            type: doc.type,
            patientName: doc.patient.name,
            createdAt: doc.createdAt,
            encryptedData: doc.encryptedData,
            doctorEncryptedKey: accessDetail.doctorEncryptedKey,
            expiresAt: accessDetail.expiresAt,
            status: 'Valid'
        } });
    } catch (error) {
        next(error);
    }
};

const CertificateRequest = require('../models/CertificateRequest');

/**
 * getCertificateRequests
 * @description Handles operations for getCertificateRequests. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getCertificateRequests = async (req, res, next) => {
    try {
        const requests = await CertificateRequest.find({
            doctorRequested: req.user._id,
            status: 'pending'
        }).populate('patient', 'name email').lean();

        res.status(200).json({ success: true, message: 'Operation successful', data: requests });
    } catch (error) {
        next(error);
    }
};

/**
 * approveCertificateRequest
 * @description Handles operations for approveCertificateRequest. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.approveCertificateRequest = async (req, res, next) => {
    try {
        const { diagnosis, remarks, validFrom, validUntil } = req.body;

        const request = await CertificateRequest.findOne({
            _id: req.params.id,
            doctorRequested: req.user._id,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or already processed' , error: 'Request not found or already processed'  });
        }

        if (!diagnosis || !validFrom || !validUntil) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' , error: 'Please provide all required fields'  });
        }

        // Certificate.patient is the Patient-profile _id (request.patient is a User _id). Never create a profile here.
        const patientProfile = await resolvePatientProfile(request.patient);
        if (!patientProfile) {
            return res.status(400).json({ success: false, message: 'A Patient profile is required to issue a certificate for this patient.', error: 'PATIENT_PROFILE_REQUIRED' });
        }

        if (request.certificateType === 'vaccine') {
            const vaccineDoc = await PatientDocument.findOne({
                patient: request.patient,
                type: 'vaccine_certificate'
            });

            if (!vaccineDoc) {
                return res.status(400).json({ success: false, message: 'Patient does not have a vaccine document.' , error: 'Patient does not have a vaccine document.'  });
            }

            const hasAccess = vaccineDoc.accessList.some(
                (access) => access.doctor.toString() === req.user._id.toString() && new Date() < new Date(access.expiresAt)
            );

            if (!hasAccess) {
                return res.status(403).json({ success: false, message: 'You do not have active access to the patient\'s vaccine document to approve this certificate.' , error: 'You do not have active access to the patient\'s vaccine document to approve this certificate.'  });
            }
        }

        // Issue the certificate
        const hashString = `${request.patient.toString()}|${diagnosis}|${validFrom}|${validUntil}`;
        const secret = process.env.JWT_SECRET;
        const verificationHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        const certificate = await Certificate.create({
            patient: patientProfile._id,
            issuedBy: req.user._id,
            diagnosis,
            remarks,
            validFrom,
            validUntil,
            verificationHash,
            accessList: [req.user._id],
        });

        // Update request status
        request.status = 'approved';
        await request.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'ISSUE_CERTIFICATE',
            details: { certificateId: certificate._id, requestId: request._id, patientId: request.patient }
        });

        res.status(200).json({ success: true, message: 'Certificate request approved and issued', data: {
            certificate
        } });
    } catch (error) {
        next(error);
    }
};
