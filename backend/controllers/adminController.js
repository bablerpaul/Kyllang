const User = require('../models/User');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const saveHash = require('../app'); // custom ethers contract instance for anchoring

// @desc    Get system analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin only)
exports.getAnalytics = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'general_user' });
        const totalDoctors = await User.countDocuments({ role: 'doctor' });
        const totalCertificates = await Certificate.countDocuments();

        // You can add more complex aggregates here (e.g. certs issued this month)

        res.status(200).json({
            totalUsers,
            totalPatients: totalUsers,
            totalDoctors,
            totalCertificates,
            activeHospitals: 1, // Placeholder
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users (for management)
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'hospital_admin' } }).select('-password');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const crypto = require('crypto');

// @desc    Create a new user (Patient or Doctor) with RSA Key Pair
// @route   POST /api/admin/users
// @access  Private (Admin only)
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role, specialty } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Please provide name, email, password, and role' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Generate RSA Key Pair for the new user (for Proxy Re-Encryption PoC)
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        const user = await User.create({
            name,
            email,
            password,
            role,
            specialty: role === 'doctor' ? specialty : undefined,
            publicKey, // Store public key in DB
        });

        // Send private key to the admin ONCE to give to the user

        await AuditLog.create({
            actor: req.user._id,
            action: 'CREATE_USER',
            details: { createdUserId: user._id, role: user.role }
        });

        res.status(201).json({
            message: 'User created successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
            },
            privateKey, // IMPORTANT: Admin will see this once, user must store it!
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Assign a patient to a doctor
// @route   POST /api/admin/assign
// @access  Private (Admin only)
exports.assignDoctor = async (req, res) => {
    try {
        console.log("assignDoctor: 1 - Start");
        const { doctorId, patientId } = req.body;

        if (!doctorId || !patientId) {
            return res.status(400).json({ message: 'Please provide doctorId and patientId' });
        }

        console.log("assignDoctor: 2 - Find Doctor");
        const doctor = await User.findById(doctorId);
        if (!doctor || doctor.role !== 'doctor') {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        console.log("assignDoctor: 3 - Find Patient");
        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ message: 'Patient not found' });
        }

        console.log("assignDoctor: 4 - Check Includes");
        if (doctor.assignedPatients.includes(patientId)) {
            return res.status(400).json({ message: 'Patient is already assigned to this doctor' });
        }

        console.log("assignDoctor: 5 - Push Patient");
        doctor.assignedPatients.push(patientId);

        console.log("assignDoctor: 6 - Save Doctor");
        await doctor.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'ASSIGN_DOCTOR',
            details: { doctorId: doctor._id, patientId: patient._id }
        });

        console.log("assignDoctor: 7 - Success");
        res.status(200).json({ message: 'Patient assigned to doctor successfully' });
    } catch (error) {
        console.error('Assign Doctor Error Stack Trace:', error.stack);
        res.status(500).json({ message: error.message });
    }
};

const PatientDocument = require('../models/PatientDocument');

// @desc    Upload an Encrypted Document for a patient
// @route   POST /api/admin/documents
// @access  Private (Admin only)
exports.uploadDocument = async (req, res) => {
    try {
        const { patientId, title, type, encryptedData, patientEncryptedKey } = req.body;

        if (!patientId || !title || !encryptedData || !patientEncryptedKey) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ message: 'Patient not found' });
        }

        const doc = await PatientDocument.create({
            patient: patientId,
            title,
            type: type || 'other',
            encryptedData,
            patientEncryptedKey,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'UPLOAD_DOCUMENT',
            details: { documentId: doc._id, patientId }
        });

        res.status(201).json({
            message: 'Document uploaded successfully',
            documentId: doc._id,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Anchor unanchored audit logs to the blockchain placeholder
// @route   POST /api/admin/anchor-logs
// @access  Private (Admin only)
exports.anchorLogs = async (req, res) => {
    try {
        // 1. Efficiently query unanchored logs (uses the isAnchored index)
        const unanchoredLogs = await AuditLog.find({ isAnchored: false }).lean();

        // Handle empty state gracefully
        if (!unanchoredLogs || unanchoredLogs.length === 0) {
            return res.status(200).json({
                message: 'No unanchored logs found.',
                processedCount: 0,
                batchHash: null
            });
        }

        // 2. Cryptographic Hashing: Deterministic Object Hashing
        const hashPayloads = unanchoredLogs.map(log => {
            const coreData = {
                _id: log._id.toString(),
                action: log.action,
                actor: log.actor.toString(),
                createdAt: log.createdAt.toISOString()
            };
            // Deterministic JSON stringify (keys in alphabetical order)
            const deterministicString = JSON.stringify(coreData, Object.keys(coreData).sort());

            return crypto.createHash('sha256').update(deterministicString).digest('hex');
        });

        // Create a single deterministic batch hash (simplified root hash)
        hashPayloads.sort();
        const batchHash = crypto.createHash('sha256').update(hashPayloads.join('')).digest('hex');

        // 3. Anchor batch hash on blockchain
        try {
            await saveHash(batchHash);
        } catch (chainErr) {
            console.error('Blockchain anchoring failed', chainErr);
            return res.status(500).json({ error: 'Blockchain anchoring failed' });
        }

        // 4. Database Update: Performant Batch Update
        const logIds = unanchoredLogs.map(log => log._id);

        await AuditLog.updateMany(
            { _id: { $in: logIds } },
            {
                $set: {
                    isAnchored: true,
                    blockchainHash: batchHash
                }
            }
        );

        // 5. Response
        res.status(200).json({
            message: 'Logs successfully anchored',
            processedCount: unanchoredLogs.length,
            batchHash: batchHash
        });

    } catch (error) {
        console.error('Error anchoring logs:', error);
        res.status(500).json({ message: 'Server error during log anchoring' });
    }
};
