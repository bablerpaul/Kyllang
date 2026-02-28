const User = require('../models/User');
const Certificate = require('../models/Certificate');
const PatientDocument = require('../models/PatientDocument');
const AuditLog = require('../models/AuditLog');

// @desc    Get assigned patients
// @route   GET /api/doctor/patients
// @access  Private (Doctor only)
exports.getPatients = async (req, res) => {
    try {
        const doctor = await User.findById(req.user._id).populate('assignedPatients', 'name email');

        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        res.status(200).json(doctor.assignedPatients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get documents for a specific patient
// @route   GET /api/doctor/patients/:patientId/documents
// @access  Private (Doctor only)
exports.getPatientDocuments = async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctorId = req.user._id;

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

        res.status(200).json(mappedDocs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Request access to a document
// @route   POST /api/doctor/documents/:docId/request
// @access  Private (Doctor only)
exports.requestDocumentAccess = async (req, res) => {
    try {
        const doc = await PatientDocument.findById(req.params.docId);
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        const doctorId = req.user._id;

        // Check if already requested
        const alreadyRequested = doc.accessRequests.some(r => r.doctor.toString() === doctorId.toString());
        if (alreadyRequested) {
            return res.status(400).json({ message: 'Already requested access' });
        }

        doc.accessRequests.push({ doctor: doctorId });
        await doc.save();

        await AuditLog.create({
            actor: doctorId,
            action: 'OTHER',
            details: { type: 'request_document_access', documentId: doc._id }
        });

        res.status(200).json({ message: 'Access requested successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const crypto = require('crypto');

// @desc    Issue a new certificate to a patient
// @route   POST /api/doctor/certificates
// @access  Private (Doctor only)
exports.issueCertificate = async (req, res) => {
    try {
        const { patientId, diagnosis, remarks, validFrom, validUntil } = req.body;

        if (!patientId || !diagnosis || !validFrom || !validUntil) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ message: 'Patient not found' });
        }

        // Generate a HMAC verification hash (Zero-Knowledge Proof concept)
        const hashString = `${patientId}|${diagnosis}|${validFrom}|${validUntil}`;
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const verificationHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        const certificate = await Certificate.create({
            patient: patientId,
            issuedBy: req.user._id,
            diagnosis,
            remarks,
            validFrom,
            validUntil,
            verificationHash,
            accessList: [req.user._id], // Doctor issuing it has access by default
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'ISSUE_CERTIFICATE',
            details: { certificateId: certificate._id, patientId }
        });

        res.status(201).json({
            message: 'Certificate issued successfully',
            certificateId: certificate._id,
            verificationHash,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Get a single document with its encrypted data
// @route   GET /api/doctor/documents/:docId
// @access  Private (Doctor only)
exports.getDocument = async (req, res) => {
    try {
        const doc = await PatientDocument.findById(req.params.docId).populate('patient', 'name');
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        const doctorId = req.user._id;

        const hasAccess = doc.accessList.some((access) => {
            return access.doctor.toString() === doctorId.toString() &&
                new Date() < new Date(access.expiresAt);
        });

        if (!hasAccess) {
            return res.status(403).json({ message: 'No active access to this document' });
        }

        const accessDetail = doc.accessList.find(a => a.doctor.toString() === doctorId.toString());

        res.status(200).json({
            _id: doc._id,
            title: doc.title,
            type: doc.type,
            patientName: doc.patient.name,
            createdAt: doc.createdAt,
            encryptedData: doc.encryptedData,
            doctorEncryptedKey: accessDetail.doctorEncryptedKey,
            expiresAt: accessDetail.expiresAt,
            status: 'Valid'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const CertificateRequest = require('../models/CertificateRequest');

// @desc    Get pending certificate requests for the doctor
// @route   GET /api/doctor/certificate-requests
// @access  Private (Doctor only)
exports.getCertificateRequests = async (req, res) => {
    try {
        const requests = await CertificateRequest.find({
            doctorRequested: req.user._id,
            status: 'pending'
        }).populate('patient', 'name email');

        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve a certificate request
// @route   POST /api/doctor/certificate-requests/:id/approve
// @access  Private (Doctor only)
exports.approveCertificateRequest = async (req, res) => {
    try {
        const { diagnosis, remarks, validFrom, validUntil } = req.body;

        const request = await CertificateRequest.findOne({
            _id: req.params.id,
            doctorRequested: req.user._id,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({ message: 'Request not found or already processed' });
        }

        if (!diagnosis || !validFrom || !validUntil) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        if (request.certificateType === 'vaccine') {
            const vaccineDoc = await PatientDocument.findOne({
                patient: request.patient,
                type: 'vaccine_certificate'
            });

            if (!vaccineDoc) {
                return res.status(400).json({ message: 'Patient does not have a vaccine document.' });
            }

            const hasAccess = vaccineDoc.accessList.some(
                (access) => access.doctor.toString() === req.user._id.toString() && new Date() < new Date(access.expiresAt)
            );

            if (!hasAccess) {
                return res.status(403).json({ message: 'You do not have active access to the patient\'s vaccine document to approve this certificate.' });
            }
        }

        // Issue the certificate
        const hashString = `${request.patient.toString()}|${diagnosis}|${validFrom}|${validUntil}`;
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const verificationHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        const certificate = await Certificate.create({
            patient: request.patient,
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

        res.status(200).json({
            message: 'Certificate request approved and issued',
            certificate
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
