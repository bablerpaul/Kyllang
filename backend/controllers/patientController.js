const PatientDocument = require('../models/PatientDocument');
const CertificateRequest = require('../models/CertificateRequest');
const AuditLog = require('../models/AuditLog');

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

const User = require('../models/User');

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
        const certificates = await Certificate.find({ patient: req.user._id })
            .populate('issuedBy', 'name email specialty');
        res.status(200).json({ success: true, message: 'Operation successful', data: certificates });
    } catch (error) {
        next(error);
    }
};
