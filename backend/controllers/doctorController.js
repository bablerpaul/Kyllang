const User = require('../models/User');
const fs = require('fs');
const Certificate = require('../models/Certificate');
const PatientDocument = require('../models/PatientDocument');
const AuditLog = require('../models/AuditLog');
const MedicalRecord = require('../models/MedicalRecord');
const Doctor = require('../models/Doctor');

const blockchainContract = require('../blockchain');
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
exports.issueCertificate = async (req, res, next) => {
    try {
        const { patientId, diagnosis, remarks, validFrom, validUntil, medicalRecordId, emrId, insuranceClaimId } = req.body;

        if (!patientId || !diagnosis || !validFrom || !validUntil) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' , error: 'Please provide all required fields'  });
        }

        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ success: false, message: 'Patient not found' , error: 'Patient not found'  });
        }

        // Connect certificate to an existing EMR
        const targetEmrId = medicalRecordId || emrId;
        let emrRecord = null;

        if (targetEmrId) {
            emrRecord = await MedicalRecord.findById(targetEmrId);
        }

        if (!emrRecord) {
            emrRecord = await MedicalRecord.findOne({ patient: patientId }).sort({ createdAt: -1 });
            if (!emrRecord) {
                let doctorDoc = await Doctor.findOne({ user: req.user._id });
                if (!doctorDoc) {
                    doctorDoc = await Doctor.create({
                        user: req.user._id,
                        specialty: 'General Medicine',
                        licenseNumber: `DOC-${req.user._id.toString().substring(18)}`,
                    });
                }
                emrRecord = await MedicalRecord.create({
                    patient: patientId,
                    doctor: doctorDoc._id,
                    diagnosis,
                    chiefComplaint: 'Medical Certificate Evaluation',
                    visitDate: new Date(validFrom),
                });
            }
        }

        let doctorProfile = await Doctor.findOne({ user: req.user._id });
        if (!doctorProfile) {
            doctorProfile = await Doctor.create({
                user: req.user._id,
                specialty: 'General Medicine',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`,
            });
        }

        // Generate a HMAC verification hash (Zero-Knowledge Proof concept)
        const hashString = `${patientId}|${diagnosis}|${validFrom}|${validUntil}`;
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const verificationHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        let transactionHash = null;
        try {
            const tx = await blockchainContract.storeEMRRecord(
                patientId.toString(),
                'MedicalCertificate',
                verificationHash,
                ''
            );
            await tx.wait();
            transactionHash = tx.hash;
        } catch (contractError) {
            console.error('Blockchain storeEMRRecord failed:', contractError.message);
        }

        const certificate = await Certificate.create({
            patient: patientId,
            issuedBy: req.user._id,
            doctor: doctorProfile._id,
            medicalRecord: emrRecord._id,
            insuranceClaim: insuranceClaimId || undefined,
            diagnosis,
            remarks,
            validFrom,
            validUntil,
            verificationHash,
            blockchainHash: transactionHash || verificationHash,
            transactionHash: transactionHash,
            accessList: [req.user._id],
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'ISSUE_CERTIFICATE',
            details: { certificateId: certificate._id, patientId, emrId: emrRecord._id, transactionHash }
        });

        // Handle physical file upload securely
        if (req.file) {
            try {
                const filePath = req.file.path;
                const { secureFile } = await storageService.uploadSecurePayload({
                    filePath,
                    fileName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    patientId,
                    uploaderId: req.user._id,
                    documentType: 'MedicalCertificate',
                    linkedCertificate: certificate._id
                });
                certificate.secureFileId = secureFile._id;
                await certificate.save();
            } catch (storageError) {
                console.error('Secure storage error during certificate issuance:', storageError);
                // Optionally handle failure, but for now we log it so certificate creation succeeds
                if (req.file && req.file.path) {
                    fs.promises.unlink(req.file.path).catch(err => console.error('Error deleting temp file:', err));
                }
            }
        }

        res.status(201).json({ success: true, message: 'Certificate issued successfully', data: {
            certificateId: certificate._id,
            verificationHash,
            blockchainHash: transactionHash || verificationHash,
            transactionHash,
            medicalRecordId: emrRecord._id,
            certificate,
        } });
    } catch (error) {
        next(error);
    }
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

        res.status(200).json({ success: true, message: 'Certificate request approved and issued', data: {
            certificate
        } });
    } catch (error) {
        next(error);
    }
};
