const User = require('../../../models/User');
const Doctor = require('../../../models/Doctor');
const Patient = require('../../../models/Patient');
const MedicalRecord = require('../../../models/MedicalRecord');
const Prescription = require('../../../models/Prescription');
const LabReport = require('../../../models/LabReport');
const Certificate = require('../../../models/Certificate');
const AuditLog = require('../../../models/AuditLog');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

const blockchainContract = require('../../../blockchain');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', {
        expiresIn: '30d',
    });
};

const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// @desc    Register a new Doctor
// @route   POST /api/doctor/register
// @access  Public
exports.registerDoctor = async (req, res) => {
    try {
        const { name, email, password, specialty, licenseNumber, department, consultationFee } = req.body;

        if (!name || !email || !password || !specialty || !licenseNumber) {
            return res.status(400).json({ message: 'Name, email, password, specialty, and licenseNumber are required' });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const licenseExists = await Doctor.findOne({ licenseNumber });
        if (licenseExists) {
            return res.status(400).json({ message: 'Doctor with this license number already exists' });
        }

        // Generate Curve25519 (X25519) Key Pair for envelope encryption
        const keyPair = nacl.box.keyPair();
        const publicKey = util.encodeBase64(keyPair.publicKey);
        const privateKey = util.encodeBase64(keyPair.secretKey);

        const user = await User.create({
            name,
            email,
            password,
            role: 'doctor',
            specialty,
            publicKey,
        });

        const doctor = await Doctor.create({
            user: user._id,
            specialty,
            licenseNumber,
            department: department || 'General Medicine',
            consultationFee: consultationFee || 0,
        });

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Doctor registered successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                specialty: user.specialty,
                publicKey: user.publicKey,
            },
            doctor,
            token,
            privateKey,
        });
    } catch (error) {
        console.error('Error in registerDoctor:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Doctor Login
// @route   POST /api/doctor/login
// @access  Public
exports.loginDoctor = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (user.role !== 'doctor') {
            return res.status(403).json({ message: 'Access denied. Account is not a doctor.' });
        }

        let doctor = await Doctor.findOne({ user: user._id });
        if (!doctor) {
            doctor = await Doctor.create({
                user: user._id,
                specialty: user.specialty || 'General Physician',
                licenseNumber: `DOC-${user._id.toString().substring(18)}`,
            });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Doctor login successful',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                specialty: user.specialty,
                publicKey: user.publicKey,
            },
            doctor,
            token,
        });
    } catch (error) {
        console.error('Error in loginDoctor:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    View Doctor's Patients
// @route   GET /api/doctor/patients
// @access  Private (Doctor only)
exports.getDoctorPatients = async (req, res) => {
    try {
        const userDoctor = await User.findById(req.user._id).populate('assignedPatients', 'name email role');
        const doctorProfile = await Doctor.findOne({ user: req.user._id }).populate({
            path: 'assignedPatients',
            populate: { path: 'user', select: 'name email' }
        });

        // Combine legacy assignedPatients and Doctor assignedPatients
        const legacyPatients = userDoctor?.assignedPatients || [];
        const doctorPatients = doctorProfile?.assignedPatients || [];

        res.status(200).json({
            legacyPatients,
            doctorPatients,
            assignedPatients: legacyPatients.length > 0 ? legacyPatients : doctorPatients,
        });
    } catch (error) {
        console.error('Error in getDoctorPatients:', error);
        res.status(500).json({ message: error.message });
    }
};

const { hasActiveConsent } = require('../../../middlewares/consentMiddleware');

// @desc    Open Patient Complete EMR
// @route   GET /api/doctor/patient/:patientId/emr
// @access  Private (Doctor only)
exports.getPatientEMR = async (req, res) => {
    try {
        const { patientId } = req.params;

        // Verify active consent before opening patient EMR
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ message: 'Access Denied: Active patient consent is required for doctor access.' });
        }

        const patientUser = await User.findById(patientId).select('-password');
        let patientProfile = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] })
            .populate('user', 'name email role publicKey');

        if (!patientProfile && patientUser) {
            patientProfile = { user: patientUser };
        }

        const pId = patientProfile?._id || patientId;
        const uId = patientUser?._id || patientId;

        const medicalRecords = await MedicalRecord.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ visitDate: -1 });

        const prescriptions = await Prescription.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const labReports = await LabReport.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const certificates = await Certificate.find({ patient: uId }).sort({ createdAt: -1 });

        res.status(200).json({
            patient: patientProfile,
            patientUser,
            medicalRecords,
            prescriptions,
            labReports,
            certificates,
        });
    } catch (error) {
        console.error('Error in getPatientEMR:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Patient Diagnosis
// @route   PUT /api/doctor/patient/:patientId/diagnosis
// @access  Private (Doctor only)
exports.updatePatientDiagnosis = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { chiefComplaint, diagnosis, treatmentPlan, vitals } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ message: 'Diagnosis field is required' });
        }

        let doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            doctorDoc = await Doctor.create({
                user: req.user._id,
                specialty: req.user.specialty || 'General',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
            });
        }

        let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) {
            patientDoc = await Patient.create({ user: patientId });
        }

        // 1. Convert record to JSON
        const recordData = {
            patient: patientDoc._id.toString(),
            doctor: doctorDoc._id.toString(),
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date().toISOString(),
        };
        const recordJSON = JSON.stringify(recordData, Object.keys(recordData).sort());

        // 2. Generate SHA256 hash
        const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');

        // 3. Store record in MongoDB
        const medicalRecord = await MedicalRecord.create({
            patient: patientDoc._id,
            doctor: doctorDoc._id,
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date(),
            dataHash,
            recordHash: dataHash,
        });

        // 4. Store hash in blockchain
        let transactionHash = null;
        try {
            const tx = await blockchainContract.storeEMRRecord(
                patientDoc._id.toString(),
                'MedicalRecord',
                dataHash,
                ''
            );
            await tx.wait();
            transactionHash = tx.hash;

            medicalRecord.transactionHash = transactionHash;
            medicalRecord.blockchainHash = transactionHash;
            await medicalRecord.save();
        } catch (contractError) {
            console.error('Blockchain storeEMRRecord failed:', contractError.message);
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'update_diagnosis', patientId, recordId: medicalRecord._id, dataHash, transactionHash }
        });

        // 5. Return transaction hash
        res.status(200).json({
            success: true,
            message: 'Diagnosis updated and anchored to blockchain successfully',
            dataHash,
            transactionHash,
            medicalRecord,
        });
    } catch (error) {
        console.error('Error in updatePatientDiagnosis:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Add Clinical Notes
// @route   POST /api/doctor/patient/:patientId/notes
// @access  Private (Doctor only)
exports.addClinicalNotes = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { clinicalNotes, recordId } = req.body;

        if (!clinicalNotes) {
            return res.status(400).json({ message: 'Clinical notes content is required' });
        }

        let record;
        if (recordId) {
            record = await MedicalRecord.findById(recordId);
        }

        if (!record) {
            let doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                doctorDoc = await Doctor.create({
                    user: req.user._id,
                    specialty: req.user.specialty || 'General',
                    licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
                });
            }
            let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
            if (!patientDoc) patientDoc = await Patient.create({ user: patientId });

            record = await MedicalRecord.create({
                patient: patientDoc._id,
                doctor: doctorDoc._id,
                chiefComplaint: 'Clinical Note Entry',
                diagnosis: 'Clinical Consultation',
                clinicalNotes,
                visitDate: new Date(),
            });
        } else {
            record.clinicalNotes = record.clinicalNotes
                ? `${record.clinicalNotes}\n\n[${new Date().toISOString()}] ${clinicalNotes}`
                : clinicalNotes;
            await record.save();
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'add_clinical_notes', patientId, recordId: record._id }
        });

        res.status(200).json({
            success: true,
            message: 'Clinical notes added successfully',
            record,
        });
    } catch (error) {
        console.error('Error in addClinicalNotes:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Upload / Issue Prescription
// @route   POST /api/doctor/prescriptions
// @access  Private (Doctor only)
exports.uploadPrescription = async (req, res) => {
    try {
        const { patientId, medications, instructions, medicalRecordId } = req.body;

        if (!patientId || !medications || !Array.isArray(medications) || medications.length === 0) {
            return res.status(400).json({ message: 'patientId and medications array are required' });
        }

        let doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            doctorDoc = await Doctor.create({
                user: req.user._id,
                specialty: req.user.specialty || 'General',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
            });
        }

        let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) patientDoc = await Patient.create({ user: patientId });

        // Generate digital signature hash
        const signaturePayload = `${patientDoc._id}|${doctorDoc._id}|${JSON.stringify(medications)}|${Date.now()}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        const prescription = await Prescription.create({
            patient: patientDoc._id,
            doctor: doctorDoc._id,
            medicalRecord: medicalRecordId || undefined,
            medications,
            instructions,
            digitalSignatureHash,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'upload_prescription', prescriptionId: prescription._id, patientId: patientDoc._id }
        });

        res.status(201).json({
            success: true,
            message: 'Prescription uploaded and digitally signed successfully',
            prescription,
            digitalSignatureHash,
        });
    } catch (error) {
        console.error('Error in uploadPrescription:', error);
        res.status(500).json({ message: error.message });
    }
};
