const PatientDocument = require('../models/PatientDocument');
const CertificateRequest = require('../models/CertificateRequest');
const AuditLog = require('../models/AuditLog');

// @desc    Get all documents for the logged in patient
// @route   GET /api/patient/documents
// @access  Private (General User only)
exports.getDocuments = async (req, res) => {
    try {
        const documents = await PatientDocument.find({ patient: req.user._id })
            .populate('accessList.doctor', 'name email')
            .populate('accessRequests.doctor', 'name email publicKey');

        res.status(200).json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve a doctor's request to access a document (stores the RE-ENCRYPTED key)
// @route   POST /api/patient/documents/:docId/approve
// @access  Private (General User only)
exports.approveDoctorAccess = async (req, res) => {
    try {
        const { doctorId, doctorEncryptedKey } = req.body;
        const docId = req.params.docId;

        if (!doctorId || !doctorEncryptedKey) {
            return res.status(400).json({ message: 'Please provide doctorId and doctorEncryptedKey' });
        }

        const doc = await PatientDocument.findOne({ _id: docId, patient: req.user._id });
        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
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

        res.status(200).json({ message: 'Access approved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const User = require('../models/User');

// @desc    Request a certificate
// @route   POST /api/patient/certificates/request
// @access  Private (General User only)
exports.requestCertificate = async (req, res) => {
    try {
        const { doctorRequested, certificateType, reason } = req.body;

        if (!certificateType) {
            return res.status(400).json({ message: 'certificateType is required' });
        }

        if (certificateType === 'vaccine') {
            const vaccineDoc = await PatientDocument.findOne({
                patient: req.user._id,
                type: 'vaccine_certificate'
            });

            if (!vaccineDoc) {
                return res.status(400).json({ message: 'Cannot request a vaccine certificate without an uploaded vaccine document.' });
            }

            // Check if user has given access to this document to the requested doctor
            const hasAccess = vaccineDoc.accessList.some(
                (access) => access.doctor.toString() === doctorRequested.toString() && new Date() < new Date(access.expiresAt)
            );

            if (!hasAccess) {
                return res.status(400).json({ message: 'You must grant the doctor access to your vaccine document before requesting this certificate.' });
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

        res.status(201).json({
            message: 'Certificate request submitted',
            request,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const Certificate = require('../models/Certificate');

// @desc    Get doctors assigned to the patient
// @route   GET /api/patient/doctors
// @access  Private (General User only)
exports.getAssignedDoctors = async (req, res) => {
    try {
        const doctors = await User.find({
            role: 'doctor',
            assignedPatients: req.user._id
        }).select('name email specialty publicKey');

        res.status(200).json(doctors);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get certificates issued to the patient
// @route   GET /api/patient/certificates
// @access  Private (General User only)
exports.getCertificates = async (req, res) => {
    try {
        const certificates = await Certificate.find({ patient: req.user._id })
            .populate('issuedBy', 'name email specialty');
        res.status(200).json(certificates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
