const Prescription = require('../../../models/Prescription');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');

// Helper to resolve Patient Document ID
const resolvePatientId = async (idInput) => {
    let patient = await Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!patient) {
        const userExists = await User.findById(idInput);
        if (userExists) {
            patient = await Patient.create({ user: idInput });
        }
    }
    return patient ? patient._id : idInput;
};

// Helper to resolve Doctor Document ID
const resolveDoctorId = async (idInput) => {
    let doctor = await Doctor.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!doctor) {
        doctor = await Doctor.create({
            user: idInput,
            specialty: 'General Medicine',
            licenseNumber: `DOC-${idInput.toString().substring(18)}`,
        });
    }
    return doctor ? doctor._id : idInput;
};

// @desc    Create a new Prescription belonging to an EMR
// @route   POST /api/prescriptions
// @access  Private (Doctor only)
exports.createPrescription = async (req, res) => {
    try {
        const { emrId, medicalRecord, patientId, patient, medications, instructions } = req.body;

        const targetEmrId = emrId || medicalRecord;
        const targetPatientInput = patientId || patient;

        if (!medications || !Array.isArray(medications) || medications.length === 0) {
            return res.status(400).json({ message: 'Medications array is required and must contain at least one item' });
        }

        for (const med of medications) {
            if (!med.name || !med.dosage || !med.frequency || !med.duration) {
                return res.status(400).json({ message: 'Each medication must have name, dosage, frequency, and duration' });
            }
        }

        let resolvedPatientId;
        let emrDoc;

        if (targetEmrId) {
            emrDoc = await MedicalRecord.findById(targetEmrId);
            if (emrDoc) {
                resolvedPatientId = emrDoc.patient;
            }
        }

        if (!resolvedPatientId && targetPatientInput) {
            resolvedPatientId = await resolvePatientId(targetPatientInput);
        }

        if (!resolvedPatientId) {
            return res.status(400).json({ message: 'Valid Patient or EMR reference is required' });
        }

        const resolvedDoctorId = await resolveDoctorId(req.user._id);

        // Generate SHA-256 Digital Signature Hash
        const signaturePayload = `${resolvedPatientId}|${resolvedDoctorId}|${targetEmrId || 'NO_EMR'}|${JSON.stringify(medications)}|${Date.now()}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        const prescription = await Prescription.create({
            patient: resolvedPatientId,
            doctor: resolvedDoctorId,
            medicalRecord: targetEmrId || undefined,
            medications,
            instructions,
            digitalSignatureHash,
        });

        const populatedPrescription = await Prescription.findById(prescription._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate');

        // Store Audit Log for CREATED action
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: digitalSignatureHash,
            details: { medicationsCount: medications.length, patientId: resolvedPatientId }
        });

        res.status(201).json({
            success: true,
            message: 'Prescription created and digitally signed successfully',
            prescription: populatedPrescription,
        });
    } catch (error) {
        console.error('Error in createPrescription:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all Prescriptions
// @route   GET /api/prescriptions
// @access  Private
exports.getAllPrescriptions = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (req.query.patientId) {
            const pId = await resolvePatientId(req.query.patientId);
            filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
        }

        const prescriptions = await Prescription.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            details: { count: prescriptions.length }
        });

        res.status(200).json(prescriptions);
    } catch (error) {
        console.error('Error in getAllPrescriptions:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Prescriptions by EMR ID
// @route   GET /api/prescriptions/emr/:emrId
// @access  Private
exports.getPrescriptionsByEmr = async (req, res) => {
    try {
        const prescriptions = await Prescription.find({ medicalRecord: req.params.emrId })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: req.params.emrId,
            details: { type: 'get_by_emr', count: prescriptions.length }
        });

        res.status(200).json(prescriptions);
    } catch (error) {
        console.error('Error in getPrescriptionsByEmr:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Prescriptions by Patient ID
// @route   GET /api/prescriptions/patient/:patientId
// @access  Private
exports.getPrescriptionsByPatient = async (req, res) => {
    try {
        const pId = await resolvePatientId(req.params.patientId);
        const prescriptions = await Prescription.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: req.params.patientId,
            details: { type: 'get_by_patient', count: prescriptions.length }
        });

        res.status(200).json(prescriptions);
    } catch (error) {
        console.error('Error in getPrescriptionsByPatient:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single Prescription by ID
// @route   GET /api/prescriptions/:id
// @access  Private
exports.getPrescriptionById = async (req, res) => {
    try {
        const prescription = await Prescription.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate');

        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: prescription.digitalSignatureHash,
            details: { status: prescription.status }
        });

        res.status(200).json(prescription);
    } catch (error) {
        console.error('Error in getPrescriptionById:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Prescription
// @route   PUT /api/prescriptions/:id
// @access  Private (Doctor only)
exports.updatePrescription = async (req, res) => {
    try {
        const { medications, instructions, status } = req.body;

        let prescription = await Prescription.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        if (medications !== undefined) prescription.medications = medications;
        if (instructions !== undefined) prescription.instructions = instructions;
        if (status !== undefined) prescription.status = status;

        const signaturePayload = `${prescription.patient}|${prescription.doctor}|${prescription.medicalRecord || 'NO_EMR'}|${JSON.stringify(prescription.medications)}|${Date.now()}`;
        prescription.digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        await prescription.save();

        const updated = await Prescription.findById(prescription._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate');

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: prescription.digitalSignatureHash,
            details: { status: prescription.status }
        });

        res.status(200).json({
            success: true,
            message: 'Prescription updated successfully',
            prescription: updated,
        });
    } catch (error) {
        console.error('Error in updatePrescription:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete Prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private (Doctor or Admin only)
exports.deletePrescription = async (req, res) => {
    try {
        const prescription = await Prescription.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        const hash = prescription.digitalSignatureHash;
        await Prescription.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'Prescription',
            resourceId: req.params.id,
            hash,
            details: { type: 'delete_prescription' }
        });

        res.status(200).json({
            success: true,
            message: 'Prescription deleted successfully',
        });
    } catch (error) {
        console.error('Error in deletePrescription:', error);
        res.status(500).json({ message: error.message });
    }
};
