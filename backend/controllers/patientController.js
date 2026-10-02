const PatientDocument = require('../models/PatientDocument');
const CertificateRequest = require('../models/CertificateRequest');
const AuditLog = require('../models/AuditLog');
const { patientCertificateIds, resolvePatientProfile } = require('../services/certificatePatientService');
const DoctorCertificateRequest = require('../models/DoctorCertificateRequest');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

/**
 * getDocuments
 * @description Handles operations for getDocuments. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getDocuments = async (req, res, next) => {
    try {
        const documents = await PatientDocument.find({ patient: req.user._id })
            .populate('accessList.doctor', 'name email')
            .populate('accessRequests.doctor', 'name email publicKey');

        res.status(200).json({ success: true, message: 'Operation successful', data: documents });
    } catch (error) {
        next(error);
    }
};

/**
 * approveDoctorAccess
 * @description Handles operations for approveDoctorAccess. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.approveDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId, doctorEncryptedKey } = req.body;
        const docId = req.params.docId;

        if (!doctorId || !doctorEncryptedKey) {
            return res.status(400).json({ success: false, message: 'Please provide doctorId and doctorEncryptedKey' , error: 'Please provide doctorId and doctorEncryptedKey'  });
        }

        const doc = await PatientDocument.findOne({ _id: docId, patient: req.user._id });
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' , error: 'Document not found'  });
        }

        // Add to accessList with 24 hours expiry
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Remove from pending requests
        doc.accessRequests = doc.accessRequests.filter(
            (req) => req.doctor.toString() !== doctorId.toString()
        );

        // Check if already in access list to update or push
        const existingAccessIndex = doc.accessList.findIndex(
            (a) => a.doctor.toString() === doctorId.toString()
        );

        if (existingAccessIndex >= 0) {
            doc.accessList[existingAccessIndex].doctorEncryptedKey = doctorEncryptedKey;
            doc.accessList[existingAccessIndex].expiresAt = expiresAt;
        } else {
            doc.accessList.push({
                doctor: doctorId,
                doctorEncryptedKey,
                expiresAt,
            });
        }

        await doc.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'approve_doctor_access', documentId: docId, doctorId }
        });

        res.status(200).json({ success: true, message: 'Access approved successfully' , data: { } });
    } catch (error) {
        next(error);
    }
};

/**
 * rejectDoctorAccess
 * @description Handles operations for rejectDoctorAccess. Denies a pending access request.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.rejectDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId } = req.body;
        const docId = req.params.docId;

        if (!doctorId) {
            return res.status(400).json({ success: false, message: 'Please provide doctorId', error: 'Please provide doctorId' });
        }

        const doc = await PatientDocument.findOne({ _id: docId, patient: req.user._id });
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found', error: 'Document not found' });
        }

        // Check if the doctor is actually in accessRequests
        const requestExists = doc.accessRequests.some(
            (r) => r.doctor.toString() === doctorId.toString()
        );

        if (!requestExists) {
            return res.status(404).json({ success: false, message: 'Pending request not found', error: 'Pending request not found' });
        }

        // Remove from pending requests
        doc.accessRequests = doc.accessRequests.filter(
            (r) => r.doctor.toString() !== doctorId.toString()
        );

        await doc.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'reject_doctor_access', documentId: docId, doctorId }
        });

        res.status(200).json({ success: true, message: 'Access request denied', data: {} });
    } catch (error) {
        next(error);
    }
};

const User = require('../models/User');

exports.enrollPublicKey = async (req, res, next) => {
    try {
        const { publicKey } = req.body || {};
        if (!publicKey || typeof publicKey !== 'string') {
            return res.status(400).json({ success: false, message: 'publicKey is required' });
        }

        let decoded;
        try {
            decoded = util.decodeBase64(publicKey);
        } catch (_) {
            return res.status(400).json({ success: false, message: 'publicKey must be valid base64' });
        }
        if (decoded.length !== nacl.box.publicKeyLength) {
            return res.status(400).json({ success: false, message: 'publicKey must be a 32-byte X25519 public key' });
        }

        const user = await User.findById(req.user._id).select('publicKey');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.publicKey) {
            return res.status(409).json({ success: false, message: 'Public key is already enrolled' });
        }
        await User.findByIdAndUpdate(req.user._id, { $set: { publicKey } });
        res.status(200).json({ success: true, message: 'Public key enrolled' });
    } catch (error) {
        next(error);
    }
};

exports.rotatePublicKey = async (req, res, next) => {
    try {
        const { publicKey } = req.body || {};
        if (!publicKey || typeof publicKey !== 'string') {
            return res.status(400).json({ success: false, message: 'publicKey is required' });
        }

        let decoded;
        try {
            decoded = util.decodeBase64(publicKey);
        } catch (_) {
            return res.status(400).json({ success: false, message: 'publicKey must be valid base64' });
        }
        if (decoded.length !== nacl.box.publicKeyLength) {
            return res.status(400).json({ success: false, message: 'publicKey must be a 32-byte X25519 public key' });
        }

        const user = await User.findById(req.user._id).select('publicKey');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await User.findByIdAndUpdate(req.user._id, { $set: { publicKey } });
        
        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'rotate_public_key' }
        });
        
        res.status(200).json({ success: true, message: 'Public key rotated successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * requestCertificate
 * @description Handles operations for requestCertificate. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.requestCertificate = async (req, res, next) => {
    try {
        const { doctorRequested, certificateType, reason } = req.body;

        if (!certificateType) {
            return res.status(400).json({ success: false, message: 'certificateType is required' , error: 'certificateType is required'  });
        }

        if (certificateType === 'vaccine') {
            const vaccineDoc = await PatientDocument.findOne({
                patient: req.user._id,
                type: 'vaccine_certificate'
            });

            if (!vaccineDoc) {
                return res.status(400).json({ success: false, message: 'Cannot request a vaccine certificate without an uploaded vaccine document.' , error: 'Cannot request a vaccine certificate without an uploaded vaccine document.'  });
            }

            // Check if user has given access to this document to the requested doctor
            const hasAccess = vaccineDoc.accessList.some(
                (access) => access.doctor.toString() === doctorRequested.toString() && new Date() < new Date(access.expiresAt)
            );

            if (!hasAccess) {
                return res.status(400).json({ success: false, message: 'You must grant the doctor access to your vaccine document before requesting this certificate.' , error: 'You must grant the doctor access to your vaccine document before requesting this certificate.'  });
            }
        }

        const request = await CertificateRequest.create({
            patient: req.user._id,
            doctorRequested,
            certificateType,
            reason,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'request_certificate', requestId: request._id, doctorRequested }
        });

        res.status(201).json({ success: true, message: 'Certificate request submitted', data: {
            request,
        } });
    } catch (error) {
        next(error);
    }
};

const Certificate = require('../models/Certificate');

/**
 * getAssignedDoctors
 * @description Handles operations for getAssignedDoctors. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAssignedDoctors = async (req, res, next) => {
    try {
        const doctors = await User.find({
            role: 'doctor',
            assignedPatients: req.user._id
        }).select('name email specialty publicKey');

        res.status(200).json({ success: true, message: 'Operation successful', data: doctors });
    } catch (error) {
        next(error);
    }
};

/**
 * getCertificates
 * @description Handles operations for getCertificates. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getCertificates = async (req, res, next) => {
    try {
        const Certificate = require('../models/Certificate');
        // Canonical Patient-profile _id + legacy User _id
        const patientIdentities = await patientCertificateIds(req.user._id);

        const certificates = await Certificate.find({ patient: { $in: patientIdentities } })
            .select('+encryptedCredential')
            .populate('issuedBy', 'name email specialty');
        res.status(200).json({ success: true, message: 'Operation successful', data: certificates });
    } catch (error) {
        next(error);
    }
};

/**
 * getDoctorCertificateRequests
 * @description Patient retrieves all certificate creation requests addressed to them.
 */
exports.getDoctorCertificateRequests = async (req, res, next) => {
    try {
        const patientProfile = await resolvePatientProfile(req.user._id);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        const requests = await DoctorCertificateRequest.find({ patient: patientProfile._id })
            .populate({ 
                path: 'doctor', 
                select: 'specialty department user',
                populate: { path: 'user', select: 'name email' }
            })
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, message: 'Requests retrieved successfully', data: requests });
    } catch (error) {
        next(error);
    }
};

/**
 * approveDoctorCertificateRequest
 * @description Patient approves a pending certificate creation request.
 */
exports.approveDoctorCertificateRequest = async (req, res, next) => {
    try {
        const requestId = req.params.id;
        
        if (!requestId || !requestId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing request ID' });
        }

        const patientProfile = await resolvePatientProfile(req.user._id);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        // Find the request and enforce IDOR protection by checking patient ID
        const request = await DoctorCertificateRequest.findOne({
            _id: requestId,
            patient: patientProfile._id
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Certificate request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'Request is no longer pending' });
        }

        // Atomic update to prevent double-approval race conditions
        const updatedRequest = await DoctorCertificateRequest.findOneAndUpdate(
            { _id: requestId, patient: patientProfile._id, status: 'pending' },
            { 
                $set: { 
                    status: 'approved',
                    approvedAt: new Date()
                },
                $unset: {
                    rejectedAt: 1,
                    rejectionReason: 1
                }
            },
            { new: true }
        );

        if (!updatedRequest) {
            return res.status(409).json({ success: false, message: 'Request state changed before approval could complete' });
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'APPROVE_DOCTOR_CERTIFICATE_REQUEST',
            details: {
                requestId: updatedRequest._id,
                doctor: updatedRequest.doctor,
                certificateType: updatedRequest.certificateType
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Certificate request approved successfully',
            request: {
                id: updatedRequest._id,
                doctor: updatedRequest.doctor,
                patient: updatedRequest.patient,
                certificateType: updatedRequest.certificateType,
                reason: updatedRequest.reason,
                status: updatedRequest.status,
                approvedAt: updatedRequest.approvedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

const CertificateAccessRequest = require('../models/CertificateAccessRequest');

/**
 * getCertificateAccessRequests
 * @description Retrieves pending requests for a doctor to access an existing patient certificate.
 */
exports.getCertificateAccessRequests = async (req, res, next) => {
    try {
        const patientProfile = await resolvePatientProfile(req.user._id);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        const query = { patient: patientProfile._id };
        if (req.query.status !== 'all') {
            query.status = req.query.status || 'pending';
        }

        const requests = await CertificateAccessRequest.find(query)
            .select('-doctorEncryptedCredential')
            .populate({ 
                path: 'doctor', 
                select: 'specialty department user',
                populate: { path: 'user', select: 'name email publicKey' }
            })
            .populate({
                path: 'certificate',
                select: 'patient issuedBy validFrom validUntil remarks status publicCommitmentHash createdAt'
            })
            .sort({ createdAt: -1 })
            .lean();

        // Security check: ensure the linked certificate actually belongs to the authenticated patient
        const safeRequests = requests.filter(reqDoc => {
            if (!reqDoc.certificate) return false;
            return reqDoc.certificate.patient.toString() === patientProfile._id.toString();
        });

        res.status(200).json({ success: true, message: 'Requests retrieved successfully', data: safeRequests });
    } catch (error) {
        next(error);
    }
};

/**
 * approveCertificateAccessRequest
 * @description Approves a pending certificate access request, storing the re-encrypted credential.
 */
exports.approveCertificateAccessRequest = async (req, res, next) => {
    try {
        const requestId = req.params.requestId;
        const { doctorEncryptedCredential } = req.body;

        if (!doctorEncryptedCredential || typeof doctorEncryptedCredential !== 'string' || doctorEncryptedCredential.trim() === '') {
            return res.status(400).json({ success: false, message: 'Valid doctorEncryptedCredential is required' });
        }

        const patientProfile = await resolvePatientProfile(req.user._id);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        const request = await CertificateAccessRequest.findOne({ _id: requestId, patient: patientProfile._id });
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or does not belong to you' });
        }

        if (request.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'Request is no longer pending' });
        }

        const Certificate = require('../models/Certificate');
        const cert = await Certificate.findById(request.certificate);
        if (!cert || cert.patient.toString() !== patientProfile._id.toString()) {
            return res.status(403).json({ success: false, message: 'Certificate ownership mismatch' });
        }

        const Doctor = require('../models/Doctor');
        const doctor = await Doctor.findById(request.doctor);
        if (!doctor) {
            return res.status(400).json({ success: false, message: 'Requesting doctor no longer exists' });
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const updatedRequest = await CertificateAccessRequest.findOneAndUpdate(
            {
                _id: requestId,
                patient: patientProfile._id,
                status: 'pending'
            },
            {
                $set: {
                    status: 'approved',
                    doctorEncryptedCredential: doctorEncryptedCredential,
                    approvedAt: new Date(),
                    expiresAt: expiresAt
                }
            },
            { new: true }
        );

        if (!updatedRequest) {
            return res.status(409).json({ success: false, message: 'Request state changed before approval could complete' });
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: {
                type: 'approve_certificate_access',
                requestId: updatedRequest._id,
                certificateId: cert._id,
                doctorId: doctor._id
            }
        });

        res.status(200).json({ success: true, message: 'Certificate access approved successfully', data: { status: 'approved' } });
    } catch (error) {
        next(error);
    }
};

/**
 * rejectCertificateAccessRequest
 * @description Rejects a pending certificate access request.
 */
exports.rejectCertificateAccessRequest = async (req, res, next) => {
    try {
        const requestId = req.params.requestId;
        
        let { rejectionReason } = req.body;
        if (typeof rejectionReason === 'string') {
            rejectionReason = rejectionReason.trim();
        }
        if (!rejectionReason) {
            rejectionReason = undefined;
        }

        const patientProfile = await resolvePatientProfile(req.user._id);
        if (!patientProfile) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        const request = await CertificateAccessRequest.findOne({ _id: requestId, patient: patientProfile._id });
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found or does not belong to you' });
        }

        if (request.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'Request is no longer pending' });
        }

        const Certificate = require('../models/Certificate');
        const cert = await Certificate.findById(request.certificate);
        if (!cert || cert.patient.toString() !== patientProfile._id.toString()) {
            return res.status(403).json({ success: false, message: 'Certificate ownership mismatch' });
        }

        const updatedRequest = await CertificateAccessRequest.findOneAndUpdate(
            {
                _id: requestId,
                patient: patientProfile._id,
                status: 'pending'
            },
            {
                $set: {
                    status: 'rejected',
                    rejectedAt: new Date(),
                    ...(rejectionReason && { rejectionReason })
                }
            },
            { new: true }
        );

        if (!updatedRequest) {
            return res.status(409).json({ success: false, message: 'Request state changed before rejection could complete' });
        }

        const auditDetails = {
            type: 'reject_certificate_access',
            requestId: updatedRequest._id,
            certificateId: cert._id,
            doctorId: request.doctor
        };
        
        if (rejectionReason) {
            auditDetails.rejectionReason = rejectionReason;
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: auditDetails
        });

        res.status(200).json({ success: true, message: 'Certificate access rejected successfully', data: { status: 'rejected' } });
    } catch (error) {
        next(error);
    }
};


