const User = require('../models/User');
const fs = require('fs');
const Certificate = require('../models/Certificate');
const PatientDocument = require('../models/PatientDocument');
const AuditLog = require('../models/AuditLog');
const MedicalRecord = require('../models/MedicalRecord');
const Doctor = require('../models/Doctor');
const util = require('tweetnacl-util');

const blockchainContract = require('../blockchain');
const { resolvePatientProfile, describeCertificatePatients } = require('../services/certificatePatientService');
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

        const { hasActiveConsent } = require('../middlewares/consentMiddleware');
        const isAllowed = await hasActiveConsent({ patientInput: doc.patient, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to request document access.', error: 'Access Denied: Patient active consent is required to request document access.' });
        }

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

const DoctorCertificateRequest = require('../models/DoctorCertificateRequest');
const { hasActiveConsent } = require('../middlewares/consentMiddleware');

/**
 * createDoctorCertificateRequest
 * @description Allows a Doctor to request permission to create a certificate for a patient.
 */
exports.createDoctorCertificateRequest = async (req, res, next) => {
    try {
        const { patientId, certificateType, reason } = req.body;

        if (!patientId || !patientId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing patientId' });
        }
        
        if (!certificateType || !['vaccine', 'age_verification', 'general'].includes(certificateType)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing certificateType' });
        }
        
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'Reason is required and cannot be empty' });
        }

        if (reason.length > 1000) {
            return res.status(400).json({ success: false, message: 'Reason exceeds maximum length' });
        }

        const doctorProfile = await Doctor.findOne({ user: req.user._id });
        if (!doctorProfile) {
            return res.status(403).json({ success: false, message: 'Doctor profile required' });
        }

        const patientProfile = await resolvePatientProfile(patientId);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        const isAllowed = await hasActiveConsent({
            patientInput: patientProfile._id,
            requestingUser: req.user,
            requiredScope: 'certificates'
        });

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent or assignment is required.' });
        }

        const existingRequest = await DoctorCertificateRequest.findOne({
            doctor: doctorProfile._id,
            patient: patientProfile._id,
            certificateType,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(409).json({ success: false, message: 'A pending certificate request already exists for this patient and certificate type.' });
        }

        const request = await DoctorCertificateRequest.create({
            doctor: doctorProfile._id,
            patient: patientProfile._id,
            certificateType,
            reason: reason.trim(),
            status: 'pending'
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'CREATE_DOCTOR_CERTIFICATE_REQUEST',
            details: {
                requestId: request._id,
                patientId: patientProfile._id,
                certificateType
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Certificate request created successfully',
            request: {
                id: request._id,
                doctor: request.doctor,
                patient: request.patient,
                certificateType: request.certificateType,
                reason: request.reason,
                status: request.status,
                createdAt: request.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
};

const CertificateAccessRequest = require('../models/CertificateAccessRequest');

/**
 * requestCertificateAccess
 * @description Allows a doctor to request access to an EXISTING certificate.
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
exports.requestCertificateAccess = async (req, res, next) => {
    try {
        const certId = req.params.certId;
        if (!certId || !certId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid certificate ID' });
        }

        const cert = await Certificate.findById(certId);
        if (!cert) {
            return res.status(404).json({ success: false, message: 'Certificate not found' });
        }

        const doctorProfile = await Doctor.findOne({ user: req.user._id });
        if (!doctorProfile) {
            return res.status(403).json({ success: false, message: 'Doctor profile required' });
        }

        const { hasActiveConsent } = require('../middlewares/consentMiddleware');
        const isAllowed = await hasActiveConsent({ patientInput: cert.patient, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to request certificate access.', error: 'Access Denied: Patient active consent is required to request certificate access.' });
        }

        const request = await CertificateAccessRequest.create({
            certificate: cert._id,
            patient: cert.patient,
            doctor: doctorProfile._id,
            status: 'pending'
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'request_certificate_access', certificateId: cert._id, patientId: cert.patient }
        });

        return res.status(201).json({
            success: true,
            message: 'Certificate access requested successfully',
            data: {
                id: request._id,
                status: request.status
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'A certificate access request is already pending for this certificate.' });
        }
        next(error);
    }
};

/**
 * getApprovedCertificateAccess
 * @description GET /api/doctor/certificate-access-requests/:requestId
 * Returns ONE existing certificate's doctor-specific encrypted credential, and only through the authenticated doctor's
 * own approved, unexpired CertificateAccessRequest. Authorization is the patient's approval of this specific request:
 * no broad consent check, no client-supplied doctorId. Every non-matching case (another doctor's request, pending,
 * rejected, expired, missing or inconsistent certificate) gets the same 404 so request state never leaks across doctors.
 * doctorEncryptedCredential is opaque ciphertext — never decrypted, inspected or re-encrypted here — and the patient's
 * own Certificate.encryptedCredential is never read.
 */
exports.getApprovedCertificateAccess = async (req, res, next) => {
    const notFound = () => res.status(404).json({
        success: false,
        message: 'Certificate access not found or no longer available',
        error: 'CERTIFICATE_ACCESS_NOT_FOUND',
    });

    try {
        const { requestId } = req.params;
        if (!requestId || !/^[0-9a-fA-F]{24}$/.test(requestId)) {
            return res.status(400).json({ success: false, message: 'Invalid request ID' });
        }

        // Same convention as requestCertificateAccess: the Doctor profile comes from the session, never from the client.
        const doctorProfile = await Doctor.findOne({ user: req.user._id }).select('_id').lean();
        if (!doctorProfile) {
            return res.status(403).json({ success: false, message: 'Doctor profile required' });
        }

        // The query itself is the authorization boundary.
        const accessRequest = await CertificateAccessRequest.findOne({
            _id: requestId,
            doctor: doctorProfile._id,
            status: 'approved',
            expiresAt: { $gt: new Date() },
        })
            .select('_id certificate patient status approvedAt expiresAt doctorEncryptedCredential')
            .lean();
        if (!accessRequest || typeof accessRequest.doctorEncryptedCredential !== 'string' || !accessRequest.doctorEncryptedCredential) {
            return notFound();
        }

        // Explicit allow-list: encryptedCredential (select:false) is never selected.
        const certificate = await Certificate.findById(accessRequest.certificate)
            .select('_id patient validFrom validUntil status revokedAt publicCommitmentHash blockchainTxHash issuerAddress issuedBy remarks createdAt')
            .populate('issuedBy', 'name')
            .lean();
        if (!certificate || !certificate.patient || String(certificate.patient) !== String(accessRequest.patient)) {
            return notFound();
        }

        // Reported as metadata only, with the project's read-time precedence: revoked > expired > active.
        const certificateStatus = certificate.status === 'revoked'
            ? 'revoked'
            : (certificate.validUntil && new Date(certificate.validUntil) < new Date() ? 'expired' : 'active');

        await AuditLog.create({
            actor: req.user._id,
            action: 'VIEWED',
            details: {
                type: 'view_certificate_access',
                requestId: accessRequest._id,
                certificateId: certificate._id,
            },
        });

        res.set('Cache-Control', 'no-store');
        return res.status(200).json({
            success: true,
            message: 'Approved certificate access retrieved',
            data: {
                request: {
                    requestId: accessRequest._id,
                    status: accessRequest.status,
                    approvedAt: accessRequest.approvedAt,
                    expiresAt: accessRequest.expiresAt,
                },
                certificate: {
                    certificateId: certificate._id,
                    validFrom: certificate.validFrom,
                    validUntil: certificate.validUntil,
                    status: certificateStatus,
                    ...(certificate.revokedAt && { revokedAt: certificate.revokedAt }),
                    publicCommitmentHash: certificate.publicCommitmentHash,
                    blockchainTxHash: certificate.blockchainTxHash || null,
                    issuer: {
                        name: certificate.issuedBy?.name || null,
                        address: certificate.issuerAddress || null,
                    },
                    remarks: certificate.remarks,
                    createdAt: certificate.createdAt,
                },
                doctorEncryptedCredential: accessRequest.doctorEncryptedCredential,
            },
        });
    } catch (error) {
        next(error);
    }
};

const CERTIFICATE_ACCESS_STATUS_FILTERS = ['pending', 'approved', 'rejected', 'all'];

/**
 * getMyCertificateAccessRequests
 * @description GET /api/doctor/certificate-access-requests?status=pending|approved|rejected|all (default: pending)
 * Lists the authenticated doctor's own CertificateAccessRequests (requests to VIEW an existing certificate — not
 * DoctorCertificateRequest) with safe certificate metadata. Metadata only: no ciphertext of any kind is ever loaded or
 * returned; the doctor-specific ciphertext is available solely through GET /certificate-access-requests/:requestId.
 * A request whose certificate is missing or belongs to a different patient is omitted (same rule as the patient list),
 * so no cross-patient certificate data can surface.
 */
exports.getMyCertificateAccessRequests = async (req, res, next) => {
    try {
        // Only exact, known string values — never an object/array that could become a MongoDB operator.
        const rawStatus = req.query.status;
        if (rawStatus !== undefined && (typeof rawStatus !== 'string' || !CERTIFICATE_ACCESS_STATUS_FILTERS.includes(rawStatus))) {
            return res.status(400).json({
                success: false,
                message: `status must be one of: ${CERTIFICATE_ACCESS_STATUS_FILTERS.join(', ')}`,
            });
        }
        const statusFilter = rawStatus || 'pending';

        const doctorProfile = await Doctor.findOne({ user: req.user._id }).select('_id').lean();
        if (!doctorProfile) {
            return res.status(403).json({ success: false, message: 'Doctor profile required' });
        }

        const query = { doctor: doctorProfile._id };
        if (statusFilter !== 'all') query.status = statusFilter;

        // Explicit allow-list: doctorEncryptedCredential is never selected.
        const requests = await CertificateAccessRequest.find(query)
            .select('_id certificate patient status requestedAt approvedAt rejectedAt rejectionReason expiresAt createdAt')
            .sort({ createdAt: -1, _id: -1 })
            .lean();

        const certificateIds = [...new Set(requests.map((r) => String(r.certificate)))];
        const certificates = certificateIds.length
            ? await Certificate.find({ _id: { $in: certificateIds } })
                .select('_id patient validFrom validUntil status revokedAt publicCommitmentHash blockchainTxHash issuerAddress issuedBy remarks createdAt')
                .populate('issuedBy', 'name')
                .lean()
            : [];
        const certificateById = new Map(certificates.map((c) => [String(c._id), c]));

        const consistent = requests.filter((r) => {
            const cert = certificateById.get(String(r.certificate));
            return cert && cert.patient && String(cert.patient) === String(r.patient);
        });
        const patients = await describeCertificatePatients(consistent.map((r) => r.patient));

        const now = new Date();
        const data = consistent.map((r) => {
            const cert = certificateById.get(String(r.certificate));
            const patient = patients.get(String(r.patient));
            // Reported as metadata only, with the project's read-time precedence: revoked > expired > active.
            const certificateStatus = cert.status === 'revoked'
                ? 'revoked'
                : (cert.validUntil && new Date(cert.validUntil) < now ? 'expired' : 'active');
            return {
                requestId: r._id,
                status: r.status,
                requestedAt: r.requestedAt || r.createdAt,
                approvedAt: r.approvedAt || null,
                rejectedAt: r.rejectedAt || null,
                rejectionReason: r.rejectionReason || null,
                expiresAt: r.expiresAt || null,
                // Convenience mirror of the single-request endpoint's rule; approval is never permanent.
                accessActive: r.status === 'approved' && Boolean(r.expiresAt) && new Date(r.expiresAt) > now,
                certificate: {
                    certificateId: cert._id,
                    validFrom: cert.validFrom,
                    validUntil: cert.validUntil,
                    status: certificateStatus,
                    ...(cert.revokedAt && { revokedAt: cert.revokedAt }),
                    publicCommitmentHash: cert.publicCommitmentHash,
                    blockchainTxHash: cert.blockchainTxHash || null,
                    issuer: {
                        name: cert.issuedBy?.name || null,
                        address: cert.issuerAddress || null,
                    },
                    remarks: cert.remarks,
                    createdAt: cert.createdAt,
                },
                patient: {
                    patientId: patient?.patientId || String(r.patient),
                    userId: patient?.userId || null,
                    name: patient?.name || null,
                },
            };
        });

        res.set('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, message: 'Certificate access requests retrieved', data });
    } catch (error) {
        next(error);
    }
};

const X25519_PUBLIC_KEY_BYTES = 32;

/**
 * enrollDoctorPublicKey
 * @description PUT /api/doctor/public-key — body { publicKey } only.
 * One-time registration of the authenticated doctor's X25519 public key, generated in the doctor's browser.
 * The server never generates, receives or stores a private key. ENROLLMENT ONLY: an existing key is never replaced
 * (409), because a different key would make data already encrypted for this doctor unreadable. The empty-key check
 * and the write are a single atomic conditional update, so concurrent enrollments cannot both succeed.
 * Mirrors the patient enrollPublicKey validation (base64 → exactly 32 bytes).
 */
exports.enrollDoctorPublicKey = async (req, res, next) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({ success: false, message: 'Request body must be { publicKey }' });
        }
        // Accept exactly one field; anything else (privateKey, userId, doctorId, ...) is refused, never ignored.
        const extraFields = Object.keys(body).filter((k) => k !== 'publicKey');
        if (extraFields.length > 0) {
            return res.status(400).json({ success: false, message: 'Only publicKey may be sent' });
        }

        const raw = body.publicKey;
        if (typeof raw !== 'string' || raw.trim() === '') {
            return res.status(400).json({ success: false, message: 'publicKey is required' });
        }
        let decoded;
        try {
            decoded = util.decodeBase64(raw.trim());
        } catch (_) {
            return res.status(400).json({ success: false, message: 'publicKey must be valid base64' });
        }
        if (decoded.length !== X25519_PUBLIC_KEY_BYTES) {
            return res.status(400).json({ success: false, message: 'publicKey must be a 32-byte X25519 public key' });
        }
        const publicKey = util.encodeBase64(decoded); // canonical form

        // Existing convention (requestCertificateAccess / getApprovedCertificateAccess): a Doctor profile is required.
        const doctorProfile = await Doctor.findOne({ user: req.user._id }).select('_id').lean();
        if (!doctorProfile) {
            return res.status(403).json({ success: false, message: 'Doctor profile required' });
        }

        // Atomic: matches only this doctor's User while the key is still missing/empty.
        const result = await User.updateOne(
            {
                _id: req.user._id,
                role: 'doctor',
                $or: [{ publicKey: { $exists: false } }, { publicKey: null }, { publicKey: '' }],
            },
            { $set: { publicKey } },
        );
        if (result.modifiedCount !== 1) {
            return res.status(409).json({ success: false, message: 'Doctor public key is already registered.' });
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'doctor_public_key_enrolled' },
        });

        return res.status(200).json({
            success: true,
            message: 'Doctor public key enrolled',
            data: { publicKeyRegistered: true },
        });
    } catch (error) {
        next(error);
    }
};

