const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const blockchainContract = require('../../../blockchain');

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

// @desc    Create a new EMR Record
// @route   POST /api/emr
// @access  Private (Doctor or Hospital Admin only)
exports.createEMR = async (req, res) => {
    try {
        const { patientId, patient, diagnosis, symptoms, vitalSigns, vitals, allergies, medications, clinicalNotes, chiefComplaint, treatmentPlan, visitDate, attachments } = req.body;

        const targetPatientInput = patientId || patient;
        if (!targetPatientInput || !diagnosis) {
            return res.status(400).json({ message: 'Patient reference and diagnosis are required' });
        }

        const resolvedPatientId = await resolvePatientId(targetPatientInput);
        const resolvedDoctorId = await resolveDoctorId(req.user._id);

        const vDate = visitDate ? new Date(visitDate) : new Date();

        // 1. Convert record to JSON
        const recordData = {
            patient: resolvedPatientId.toString(),
            doctor: resolvedDoctorId.toString(),
            diagnosis,
            symptoms: symptoms || [],
            vitalSigns: vitalSigns || vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            allergies: allergies || [],
            medications: medications || [],
            clinicalNotes: clinicalNotes || '',
            chiefComplaint: chiefComplaint || diagnosis,
            treatmentPlan: treatmentPlan || '',
            visitDate: vDate.toISOString(),
        };
        const recordJSON = JSON.stringify(recordData, Object.keys(recordData).sort());

        // 2. Generate SHA256 hash
        const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');

        // 3. Store record in MongoDB
        const emr = await MedicalRecord.create({
            patient: resolvedPatientId,
            doctor: resolvedDoctorId,
            diagnosis,
            symptoms: symptoms || [],
            vitalSigns: vitalSigns || vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            vitals: vitals || vitalSigns,
            allergies: allergies || [],
            medications: medications || [],
            clinicalNotes,
            chiefComplaint: chiefComplaint || diagnosis,
            treatmentPlan,
            visitDate: vDate,
            attachments: attachments || [],
            dataHash,
            recordHash: dataHash,
        });

        // 4. Store hash in blockchain
        let transactionHash = null;
        try {
            const firstCid = (attachments && attachments.length > 0 && attachments[0].ipfsCid) ? attachments[0].ipfsCid : '';
            const tx = await blockchainContract.storeEMRRecord(
                resolvedPatientId.toString(),
                'MedicalRecord',
                dataHash,
                firstCid
            );
            await tx.wait();
            transactionHash = tx.hash;

            emr.transactionHash = transactionHash;
            emr.blockchainHash = transactionHash;
            await emr.save();
        } catch (contractError) {
            console.error('Blockchain contract storeEMRRecord failed:', contractError.message);
        }

        const populatedEmr = await MedicalRecord.findById(emr._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        // Store Audit Log (User, Action: CREATED, Timestamp, IP Address, Blockchain Transaction, Hash)
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: dataHash,
            blockchainTransaction: transactionHash,
            details: { patientId: resolvedPatientId, diagnosis }
        });

        res.status(201).json({
            success: true,
            message: 'EMR record created and anchored to blockchain successfully',
            dataHash,
            transactionHash,
            emr: populatedEmr,
        });
    } catch (error) {
        console.error('Error in createEMR:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all EMRs (or by patient)
// @route   GET /api/emr
// @access  Private
exports.getAllEMRs = async (req, res) => {
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

        const emrs = await MedicalRecord.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            details: { type: 'get_all_emrs', count: emrs.length }
        });

        res.status(200).json(emrs);
    } catch (error) {
        console.error('Error in getAllEMRs:', error);
        res.status(500).json({ message: error.message });
    }
};

const { hasActiveConsent } = require('../../../middlewares/consentMiddleware');

// @desc    Get patient specific EMRs
// @route   GET /api/emr/patient/:patientId
// @access  Private
exports.getPatientEMRs = async (req, res) => {
    try {
        const { patientId } = req.params;
        const pId = await resolvePatientId(patientId);

        // Verify patient-controlled consent before returning medical data
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ message: 'Access Denied: Patient active consent is required to view medical records.' });
        }

        const emrs = await MedicalRecord.find({
            $or: [{ patient: pId }, { patient: patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            resourceId: patientId,
            details: { type: 'get_patient_emrs', count: emrs.length }
        });

        res.status(200).json(emrs);
    } catch (error) {
        console.error('Error in getPatientEMRs:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single EMR by ID
// @route   GET /api/emr/:id
// @access  Private
exports.getEMRById = async (req, res) => {
    try {
        const emr = await MedicalRecord.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        if (!emr) {
            return res.status(404).json({ message: 'EMR record not found' });
        }

        // Verify patient-controlled consent before returning medical record
        const isAllowed = await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ message: 'Access Denied: Patient active consent is required to view this medical record.' });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: emr.dataHash,
            blockchainTransaction: emr.transactionHash,
            details: { diagnosis: emr.diagnosis }
        });

        res.status(200).json(emr);
    } catch (error) {
        console.error('Error in getEMRById:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update EMR Record
// @route   PUT /api/emr/:id
// @access  Private (Doctor or Hospital Admin only)
exports.updateEMR = async (req, res) => {
    try {
        const { diagnosis, symptoms, vitalSigns, vitals, allergies, medications, clinicalNotes, chiefComplaint, treatmentPlan, visitDate, attachments } = req.body;

        let emr = await MedicalRecord.findById(req.params.id);
        if (!emr) {
            return res.status(404).json({ message: 'EMR record not found' });
        }

        if (diagnosis !== undefined) emr.diagnosis = diagnosis;
        if (symptoms !== undefined) emr.symptoms = symptoms;
        if (vitalSigns !== undefined || vitals !== undefined) {
            emr.vitalSigns = { ...emr.vitalSigns, ...vitalSigns, ...vitals };
            emr.vitals = { ...emr.vitals, ...vitals, ...vitalSigns };
        }
        if (allergies !== undefined) emr.allergies = allergies;
        if (medications !== undefined) emr.medications = medications;
        if (clinicalNotes !== undefined) emr.clinicalNotes = clinicalNotes;
        if (chiefComplaint !== undefined) emr.chiefComplaint = chiefComplaint;
        if (treatmentPlan !== undefined) emr.treatmentPlan = treatmentPlan;
        if (visitDate !== undefined) emr.visitDate = visitDate;
        if (attachments !== undefined) emr.attachments = attachments;

        // Recompute hash if needed
        const recordData = {
            patient: emr.patient.toString(),
            doctor: emr.doctor.toString(),
            diagnosis: emr.diagnosis,
            symptoms: emr.symptoms,
            vitalSigns: emr.vitalSigns,
            allergies: emr.allergies,
            medications: emr.medications,
            clinicalNotes: emr.clinicalNotes || '',
            chiefComplaint: emr.chiefComplaint || emr.diagnosis,
            treatmentPlan: emr.treatmentPlan || '',
            visitDate: emr.visitDate ? emr.visitDate.toISOString() : new Date().toISOString(),
        };
        const recordJSON = JSON.stringify(recordData, Object.keys(recordData).sort());
        const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');

        emr.dataHash = dataHash;
        emr.recordHash = dataHash;
        await emr.save();

        const updatedEmr = await MedicalRecord.findById(emr._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: emr.dataHash,
            blockchainTransaction: emr.transactionHash,
            details: { type: 'update_emr' }
        });

        res.status(200).json({
            success: true,
            message: 'EMR record updated successfully',
            emr: updatedEmr,
        });
    } catch (error) {
        console.error('Error in updateEMR:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete EMR Record
// @route   DELETE /api/emr/:id
// @access  Private (Doctor or Hospital Admin only)
exports.deleteEMR = async (req, res) => {
    try {
        const emr = await MedicalRecord.findById(req.params.id);
        if (!emr) {
            return res.status(404).json({ message: 'EMR record not found' });
        }

        const dataHash = emr.dataHash;
        const transactionHash = emr.transactionHash;

        await MedicalRecord.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'MedicalRecord',
            resourceId: req.params.id,
            hash: dataHash,
            blockchainTransaction: transactionHash,
            details: { type: 'delete_emr' }
        });

        res.status(200).json({
            success: true,
            message: 'EMR record deleted successfully',
        });
    } catch (error) {
        console.error('Error in deleteEMR:', error);
        res.status(500).json({ message: error.message });
    }
};
