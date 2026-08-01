const User = require('../../../models/User');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const MedicalRecord = require('../../../models/MedicalRecord');
const Prescription = require('../../../models/Prescription');
const LabReport = require('../../../models/LabReport');
const Certificate = require('../../../models/Certificate');
const jwt = require('jsonwebtoken');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', {
        expiresIn: '30d',
    });
};

const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// @desc    Register a new Patient
// @route   POST /api/patient/register
// @access  Public
exports.registerPatient = async (req, res) => {
    try {
        const { name, email, password, dateOfBirth, gender, contactNumber, address, bloodGroup, allergies, chronicConditions } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
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

        // Generate Curve25519 (X25519) Key Pair for envelope encryption
        const keyPair = nacl.box.keyPair();
        const publicKey = util.encodeBase64(keyPair.publicKey);
        const privateKey = util.encodeBase64(keyPair.secretKey);

        // Create User account
        const user = await User.create({
            name,
            email,
            password,
            role: 'general_user',
            publicKey,
        });

        // Create linked Patient profile
        const patient = await Patient.create({
            user: user._id,
            dateOfBirth,
            gender,
            contactNumber,
            address,
            bloodGroup: bloodGroup || 'Unknown',
            allergies: allergies || [],
            chronicConditions: chronicConditions || [],
        });

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Patient registered successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
            },
            patient,
            token,
            privateKey,
        });
    } catch (error) {
        console.error('Error in registerPatient:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Patient Login
// @route   POST /api/patient/login
// @access  Public
exports.loginPatient = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (user.role !== 'general_user') {
            return res.status(403).json({ message: 'Access denied. Account is not a patient.' });
        }

        let patient = await Patient.findOne({ user: user._id });
        if (!patient) {
            patient = await Patient.create({ user: user._id });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
            },
            patient,
            token,
        });
    } catch (error) {
        console.error('Error in loginPatient:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Patient Profile
// @route   GET /api/patient/profile
// @access  Private (Patient only)
exports.getPatientProfile = async (req, res) => {
    try {
        let patient = await Patient.findOne({ user: req.user._id })
            .populate('user', 'name email role publicKey')
            .populate({
                path: 'assignedDoctors',
                populate: { path: 'user', select: 'name email' },
            });

        if (!patient) {
            patient = await Patient.create({ user: req.user._id });
            patient = await Patient.findById(patient._id).populate('user', 'name email role publicKey');
        }

        res.status(200).json(patient);
    } catch (error) {
        console.error('Error in getPatientProfile:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Patient Profile
// @route   PUT /api/patient/profile
// @access  Private (Patient only)
exports.updatePatientProfile = async (req, res) => {
    try {
        const { name, dateOfBirth, gender, contactNumber, address, emergencyContact, bloodGroup, allergies, chronicConditions } = req.body;

        if (name) {
            await User.findByIdAndUpdate(req.user._id, { name });
        }

        let patient = await Patient.findOne({ user: req.user._id });
        if (!patient) {
            patient = new Patient({ user: req.user._id });
        }

        if (dateOfBirth !== undefined) patient.dateOfBirth = dateOfBirth;
        if (gender !== undefined) patient.gender = gender;
        if (contactNumber !== undefined) patient.contactNumber = contactNumber;
        if (address !== undefined) patient.address = { ...patient.address, ...address };
        if (emergencyContact !== undefined) patient.emergencyContact = { ...patient.emergencyContact, ...emergencyContact };
        if (bloodGroup !== undefined) patient.bloodGroup = bloodGroup;
        if (allergies !== undefined) patient.allergies = allergies;
        if (chronicConditions !== undefined) patient.chronicConditions = chronicConditions;

        await patient.save();

        const updatedProfile = await Patient.findOne({ user: req.user._id })
            .populate('user', 'name email role publicKey')
            .populate({
                path: 'assignedDoctors',
                populate: { path: 'user', select: 'name email' },
            });

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            patient: updatedProfile,
        });
    } catch (error) {
        console.error('Error in updatePatientProfile:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    View Medical History Timeline
// @route   GET /api/patient/history
// @access  Private (Patient only)
exports.getPatientMedicalHistory = async (req, res) => {
    try {
        const patient = await Patient.findOne({ user: req.user._id });
        const patientId = patient ? patient._id : req.user._id;

        const medicalRecords = await MedicalRecord.find({
            $or: [{ patient: patientId }, { patient: req.user._id }],
        }).populate({
            path: 'doctor',
            populate: { path: 'user', select: 'name email' },
        }).sort({ visitDate: -1 });

        const prescriptions = await Prescription.find({
            $or: [{ patient: patientId }, { patient: req.user._id }],
        }).populate({
            path: 'doctor',
            populate: { path: 'user', select: 'name email' },
        }).sort({ createdAt: -1 });

        const labReports = await LabReport.find({
            $or: [{ patient: patientId }, { patient: req.user._id }],
        }).populate({
            path: 'orderedBy',
            populate: { path: 'user', select: 'name email' },
        }).sort({ createdAt: -1 });

        const certificates = await Certificate.find({ patient: req.user._id })
            .populate('issuedBy', 'name email specialty')
            .sort({ createdAt: -1 });

        res.status(200).json({
            patient,
            medicalRecords,
            prescriptions,
            labReports,
            certificates,
        });
    } catch (error) {
        console.error('Error in getPatientMedicalHistory:', error);
        res.status(500).json({ message: error.message });
    }
};
