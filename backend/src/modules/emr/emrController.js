const { MedicalRecord, Appointment, Prescription, LabReport, User, AuditLog } = require('../../models');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const mongoose = require('mongoose');

/**
 * getMedicalRecord
 * @description Handles operations for getMedicalRecord. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getMedicalRecord = async (req, res, next) => {
    try {
        console.log("===> HITTING getMedicalRecord", req.originalUrl, req.params);
        let userId = req.params.patientId || req.user._id;
        if (req.user.role === 'general_user' && userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this record' });
        }

        const patientDoc = await Patient.findOne({ user: userId }).populate('user', 'name email').lean();
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        // Find the latest medical record for this patient (for top-level vitals compatibility)
        let record = await MedicalRecord.findOne({ patient: patientDoc._id }).sort({ visitDate: -1 }).lean();
        
        // Find ALL medical records for the patient (EMR History)
        const emrHistory = await MedicalRecord.find({ patient: patientDoc._id })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 })
            .lean();

        // Merge patient profile data with medical record data
        const responseData = {
            ...record,
            bloodGroup: patientDoc.bloodGroup,
            allergies: patientDoc.allergies || [],
            chronicConditions: patientDoc.chronicConditions || [],
            vitals: record?.vitals || record?.vitalSigns || {},
            medicalHistory: record?.medicalHistory || [],
            emrHistory: emrHistory || []
        };

        res.status(200).json({ success: true, message: 'Operation successful', data: responseData });
    } catch (err) {
        next(err);
    }
};

/**
 * updateMedicalRecord
 * @description Handles operations for updateMedicalRecord. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updateMedicalRecord = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const { bloodGroup, allergies, chronicConditions, vitals, medicalHistory } = req.body;
        
        if (req.user.role === 'general_user' && patientId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this record' });
        }

        let record = await MedicalRecord.findOne({ patient: patientId });
        if (!record) {
            record = new MedicalRecord({ patient: patientId });
        }

        if (bloodGroup) record.bloodGroup = bloodGroup;
        if (allergies) record.allergies = allergies;
        if (chronicConditions) record.chronicConditions = chronicConditions;
        if (vitals) record.vitals = { ...record.vitals, ...vitals };
        if (medicalHistory) record.medicalHistory = medicalHistory;

        await record.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'update_medical_record', patientId }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: record });
    } catch (err) {
        next(err);
    }
};

/**
 * getAppointments
 * @description Handles operations for getAppointments. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAppointments = async (req, res, next) => {
    try {
        let filter = {};

        if (req.user.role === 'doctor') {
            // Appointment.doctor refs Doctor._id, not User._id
            const doctorDoc = await Doctor.findOne({ user: req.user._id }).select('_id');
            if (!doctorDoc) {
                return res.status(404).json({ success: false, message: 'Doctor profile not found for this account.' });
            }
            filter = { doctor: doctorDoc._id };
        } else if (req.user.role === 'general_user') {
            // Appointment.patient refs Patient._id, not User._id
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (!patientDoc) {
                return res.status(404).json({ success: false, message: 'Patient profile not found for this account.' });
            }
            filter = { patient: patientDoc._id };
        }
        // hospital_admin: filter stays {} — sees all appointments

        const appointments = await Appointment.find(filter)
            .populate({
                path: 'patient',
                select: 'dateOfBirth gender bloodGroup',
                populate: { path: 'user', select: 'name email' },
            })
            .populate({
                path: 'doctor',
                select: 'specialty licenseNumber department',
                populate: { path: 'user', select: 'name email' },
            })
            .sort({ appointmentDate: 1 })
            .lean();

        res.status(200).json({ success: true, message: 'Operation successful', data: appointments });
    } catch (err) {
        next(err);
    }
};

/**
 * createAppointment
 * @description Handles operations for createAppointment. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createAppointment = async (req, res, next) => {
    try {
        const { doctorId, patientId, appointmentDate, timeSlot, reason } = req.body;

        // ── Doctors cannot book appointments as patients ──────────────────
        if (req.user.role === 'doctor') {
            return res.status(403).json({ success: false, message: 'Doctors cannot create patient appointments.' });
        }

        // ── Input validation ──────────────────────────────────────────────
        if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
            return res.status(400).json({ success: false, message: 'A valid doctorId is required.' });
        }
        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate is required.' });
        }
        const apptDate = new Date(appointmentDate);
        if (isNaN(apptDate.getTime())) {
            return res.status(400).json({ success: false, message: 'appointmentDate is not a valid date.' });
        }
        // Compare using start-of-day UTC so a same-day booking is not rejected
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        if (apptDate < todayUtc) {
            return res.status(400).json({ success: false, message: 'appointmentDate cannot be in the past.' });
        }
        if (!timeSlot || !timeSlot.toString().trim()) {
            return res.status(400).json({ success: false, message: 'timeSlot is required.' });
        }
        if (!reason || !reason.toString().trim()) {
            return res.status(400).json({ success: false, message: 'reason is required.' });
        }

        // ── Validate Doctor ───────────────────────────────────────────────
        const doctorDoc = await Doctor.findById(doctorId);
        if (!doctorDoc) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        // ── Resolve Patient ───────────────────────────────────────────────
        let resolvedPatientId;
        if (req.user.role === 'general_user') {
            // Find the Patient profile linked to this User account
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (!patientDoc) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient profile not found for this account. Please contact the administrator.',
                });
            }
            resolvedPatientId = patientDoc._id;
        } else if (req.user.role === 'hospital_admin') {
            // Admin must supply a valid patientId
            if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
                return res.status(400).json({ success: false, message: 'Admin must provide a valid patientId.' });
            }
            const patientDoc = await Patient.findById(patientId).select('_id');
            if (!patientDoc) {
                return res.status(404).json({ success: false, message: 'Patient not found.' });
            }
            resolvedPatientId = patientDoc._id;
        } else {
            return res.status(403).json({ success: false, message: 'Not authorized to create appointments.' });
        }

        // ── Double-booking check (application level) ──────────────────────
        // The partial unique index on the model also enforces this at DB level
        // but we check first to return a clean 409 instead of a MongoError.
        const existingAppointment = await Appointment.findOne({
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            status: { $in: ['scheduled', 'completed'] },
        });
        if (existingAppointment) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor. Please choose a different time.',
            });
        }

        // ── Create ────────────────────────────────────────────────────────
        const appointment = await Appointment.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            reason: reason.trim(),
        });

        res.status(201).json({ success: true, message: 'Appointment booked successfully.', data: appointment });
    } catch (err) {
        // Handle the DB-level unique index violation as a 409 too
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor.',
            });
        }
        next(err);
    }
};

/**
 * getPrescriptions
 * @description Handles operations for getPrescriptions. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPrescriptions = async (req, res, next) => {
    try {
        let filter = {};
        if (req.user.role === 'doctor') {
            filter = { doctor: req.user._id };
        } else if (req.user.role === 'general_user') {
            filter = { patient: req.user._id };
        }
        const prescriptions = await Prescription.find(filter)
            .populate('patient', 'name email')
            .populate('doctor', 'name specialty')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, message: 'Operation successful', data: prescriptions });
    } catch (err) {
        next(err);
    }
};

/**
 * createPrescription
 * @description Handles operations for createPrescription. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createPrescription = async (req, res, next) => {
    try {
        const { patientId, medications, instructions } = req.body;

        const crypto = require('crypto');
        const signatureString = `${patientId}|${req.user._id}|${JSON.stringify(medications)}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signatureString).digest('hex');

        const prescription = await Prescription.create({
            patient: patientId,
            doctor: req.user._id,
            medications,
            instructions,
            digitalSignatureHash,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'issue_prescription', prescriptionId: prescription._id, patientId }
        });

        res.status(201).json({ success: true, message: 'Operation successful', data: prescription });
    } catch (err) {
        next(err);
    }
};

/**
 * getLabReports
 * @description Handles operations for getLabReports. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReports = async (req, res, next) => {
    try {
        let filter = {};
        if (req.user.role === 'general_user') {
            filter = { patient: req.user._id };
        } else if (req.user.role === 'doctor') {
            filter = { orderedBy: req.user._id };
        }
        const reports = await LabReport.find(filter)
            .populate('orderedBy', 'name specialty')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (err) {
        next(err);
    }
};

/**
 * createLabReport
 * @description Handles operations for createLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createLabReport = async (req, res, next) => {
    try {
        const { patientId, testCategory, testName, resultsSummary } = req.body;

        const report = await LabReport.create({
            patient: patientId,
            orderedBy: req.user._id,
            testCategory,
            testName,
            resultsSummary,
        });

        res.status(201).json({ success: true, message: 'Operation successful', data: report });
    } catch (err) {
        next(err);
    }
};
