const { MedicalRecord, Appointment, Prescription, LabReport, User, AuditLog } = require('../../models');

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
        let patientId = req.params.patientId || req.user._id;
        if (req.user.role === 'general_user' && patientId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this record' });
        }
        let record = await MedicalRecord.findOne({ patient: patientId }).populate('patient', 'name email').lean();
        if (!record) {
            record = await MedicalRecord.create({
                patient: patientId,
                bloodGroup: 'O+',
                allergies: ['Penicillin'],
                chronicConditions: ['Hypertension'],
                vitals: { bloodPressure: '120/80', heartRate: 72, temperature: 98.6, weight: 70, height: 175 },
                medicalHistory: [{ condition: 'Seasonal Allergies', diagnosedDate: new Date('2022-01-15'), status: 'active' }],
            });
            record = await record.populate('patient', 'name email');
            record = record.toObject();
        }
        res.status(200).json({ success: true, message: 'Operation successful', data: record });
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
            filter = { doctor: req.user._id };
        } else if (req.user.role === 'general_user') {
            filter = { patient: req.user._id };
        }
        const appointments = await Appointment.find(filter)
            .populate('patient', 'name email')
            .populate('doctor', 'name specialty')
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

        const pId = req.user.role === 'general_user' ? req.user._id : patientId;

        const appointment = await Appointment.create({
            patient: pId,
            doctor: doctorId,
            appointmentDate,
            timeSlot,
            reason,
        });

        res.status(201).json({ success: true, message: 'Operation successful', data: appointment });
    } catch (err) {
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
