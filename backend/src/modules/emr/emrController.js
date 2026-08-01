const { MedicalRecord, Appointment, Prescription, LabReport, User, AuditLog } = require('../../models');

// Medical Record Handlers
exports.getMedicalRecord = async (req, res) => {
    try {
        const patientId = req.params.patientId || req.user._id;
        let record = await MedicalRecord.findOne({ patient: patientId }).populate('patient', 'name email');
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
        }
        res.status(200).json(record);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateMedicalRecord = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { bloodGroup, allergies, chronicConditions, vitals, medicalHistory } = req.body;

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

        res.status(200).json(record);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Appointment Handlers
exports.getAppointments = async (req, res) => {
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
            .sort({ appointmentDate: 1 });

        res.status(200).json(appointments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createAppointment = async (req, res) => {
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

        res.status(201).json(appointment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Prescription Handlers
exports.getPrescriptions = async (req, res) => {
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
            .sort({ createdAt: -1 });

        res.status(200).json(prescriptions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createPrescription = async (req, res) => {
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

        res.status(201).json(prescription);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Lab Report Handlers
exports.getLabReports = async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'general_user') {
            filter = { patient: req.user._id };
        } else if (req.user.role === 'doctor') {
            filter = { orderedBy: req.user._id };
        }
        const reports = await LabReport.find(filter)
            .populate('patient', 'name email')
            .populate('orderedBy', 'name specialty')
            .sort({ createdAt: -1 });

        res.status(200).json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createLabReport = async (req, res) => {
    try {
        const { patientId, testCategory, testName, resultsSummary } = req.body;

        const report = await LabReport.create({
            patient: patientId,
            orderedBy: req.user._id,
            testCategory,
            testName,
            resultsSummary,
        });

        res.status(201).json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
