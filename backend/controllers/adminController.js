const User = require('../models/User');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const blockchainContract = require('../blockchain');
const SecureFile = require('../src/modules/secure-storage/models/SecureFile');
const os = require('os');
const { getMetrics } = require('../src/middlewares/metricsMiddleware');

/**
 * getAnalytics
 * @description Handles operations for getAnalytics. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAnalytics = async (req, res, next) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'general_user' });
        const totalDoctors = await User.countDocuments({ role: 'doctor' });
        const totalCertificates = await Certificate.countDocuments();

        // You can add more complex aggregates here (e.g. certs issued this month)

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            totalUsers,
            totalPatients: totalUsers,
            totalDoctors,
            totalCertificates,
            activeHospitals: 1, // Placeholder
        } });
    } catch (error) {
        next(error);
    }
};

/**
 * getAuditLogs
 * @description Handles operations for getAuditLogs. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAuditLogs = async (req, res, next) => {
    try {
        const logs = await AuditLog.find()
            .populate('user', 'name role')
            .populate('actor', 'name role')
            .sort({ timestamp: -1 })
            .limit(100);
        res.status(200).json({ success: true, message: 'Operation successful', data: logs });
    } catch (error) {
        next(error);
    }
};

/**
 * getAllUsers
 * @description Handles operations for getAllUsers. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({ role: { $ne: 'hospital_admin' } }).select('-password');
        res.status(200).json({ success: true, message: 'Operation successful', data: users });
    } catch (error) {
        next(error);
    }
};

const crypto = require('crypto');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

/**
 * createUser
 * @description Handles operations for createUser. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createUser = async (req, res, next) => {
    try {
        const { name, email, password, role, specialty } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Please provide name, email, password, and role' , error: 'Please provide name, email, password, and role'  });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' , error: 'User already exists'  });
        }

        // Generate Curve25519 (X25519) Key Pair for the new user
        const keyPair = nacl.box.keyPair();
        const publicKey = util.encodeBase64(keyPair.publicKey);
        const privateKey = util.encodeBase64(keyPair.secretKey);

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

        res.status(201).json({ success: true, message: 'User created successfully', data: {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
            },
            privateKey, // IMPORTANT: Admin will see this once, user must store it!
        } });
    } catch (error) {
        console.error('Error creating user:', error);
        next(error);
    }
};

/**
 * assignDoctor
 * @description Handles operations for assignDoctor. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.assignDoctor = async (req, res, next) => {
    try {
        console.log("assignDoctor: 1 - Start");
        const { doctorId, patientId } = req.body;

        if (!doctorId || !patientId) {
            return res.status(400).json({ success: false, message: 'Please provide doctorId and patientId' , error: 'Please provide doctorId and patientId'  });
        }

        console.log("assignDoctor: 2 - Find Doctor");
        const doctor = await User.findById(doctorId);
        if (!doctor || doctor.role !== 'doctor') {
            return res.status(404).json({ success: false, message: 'Doctor not found' , error: 'Doctor not found'  });
        }

        console.log("assignDoctor: 3 - Find Patient");
        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ success: false, message: 'Patient not found' , error: 'Patient not found'  });
        }

        console.log("assignDoctor: 4 - Check Includes");
        if (doctor.assignedPatients.includes(patientId)) {
            return res.status(400).json({ success: false, message: 'Patient is already assigned to this doctor' , error: 'Patient is already assigned to this doctor'  });
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
        res.status(200).json({ success: true, message: 'Patient assigned to doctor successfully' , data: { } });
    } catch (error) {
        console.error('Assign Doctor Error Stack Trace:', error.stack);
        next(error);
    }
};

const PatientDocument = require('../models/PatientDocument');

/**
 * uploadDocument
 * @description Handles operations for uploadDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadDocument = async (req, res, next) => {
    try {
        const { patientId, title, type, encryptedData, patientEncryptedKey } = req.body;

        if (!patientId || !title || !encryptedData || !patientEncryptedKey) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' , error: 'Please provide all required fields'  });
        }

        const patient = await User.findById(patientId);
        if (!patient || patient.role !== 'general_user') {
            return res.status(404).json({ success: false, message: 'Patient not found' , error: 'Patient not found'  });
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

        res.status(201).json({ success: true, message: 'Document uploaded successfully', data: {
            documentId: doc._id,
        } });
    } catch (error) {
        next(error);
    }
};

/**
 * anchorLogs
 * @description Handles operations for anchorLogs. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.anchorLogs = async (req, res, next) => {
    try {
        // 1. Efficiently query unanchored logs (uses the isAnchored index)
        const unanchoredLogs = await AuditLog.find({ isAnchored: false }).lean();

        // Handle empty state gracefully
        if (!unanchoredLogs || unanchoredLogs.length === 0) {
            return res.status(200).json({ success: true, message: 'No unanchored logs found.', data: {
                processedCount: 0,
                batchHash: null
            } });
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

        // 3. Web3 Placeholder
        console.log(`[Web3 Placeholder] Smart Contract Call - Anchoring Batch Hash: ${batchHash}`);
        console.log(`[Web3 Placeholder] Logs covered in this batch: ${unanchoredLogs.length}`);

        // ACTUALLY SEND TO BLOCKCHAIN
        try {
            const tx = await blockchainContract.storeHash(batchHash);
            await tx.wait();
            console.log("Successfully anchored to blockchain! TX Hash:", tx.hash);
        } catch (contractError) {
            console.error("Blockchain contract call failed:", contractError.message);
            return next(contractError);
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
        res.status(200).json({ success: true, message: 'Logs successfully anchored', data: {
            processedCount: unanchoredLogs.length,
            batchHash: batchHash
        } });

    } catch (error) {
        console.error('Error anchoring logs:', error);
        next(error);
    }
};

/**
 * getMonitoringDashboard
 * @description Returns aggregated metrics for the Admin Dashboard
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 */
exports.getMonitoringDashboard = async (req, res, next) => {
    try {
        // 1. System Metrics (CPU/Memory)
        const cpuLoad = os.loadavg();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memoryUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(2);

        // 2. Storage Usage
        const totalStorageFiles = await SecureFile.countDocuments();

        // 3. Blockchain Status
        let blockchainStatus = 'Active';
        try {
            if (blockchainContract && blockchainContract.runner) {
                await blockchainContract.runner.provider.getBlockNumber();
            }
        } catch (e) {
            blockchainStatus = 'Offline';
        }

        // 4. IPFS Status
        const ipfsStatus = process.env.TEST_MODE === 'true' ? 'Mock Active' : 'Active';

        // 5. API Response Time
        const apiMetrics = getMetrics();

        // 6. Active Users (Unique users in the last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsersData = await AuditLog.aggregate([
            { $match: { timestamp: { $gte: oneDayAgo } } },
            { $group: { _id: "$user" } }
        ]);
        const activeUsersCount = activeUsersData.length;

        // 7. Latest Uploads
        const latestUploads = await SecureFile.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('fileName fileType createdAt');

        // 8. Latest Verifications
        const latestVerifications = await AuditLog.find({ action: /verify/i })
            .populate('actor', 'name role')
            .sort({ timestamp: -1 })
            .limit(5)
            .select('action timestamp actor');

        res.status(200).json({
            success: true,
            data: {
                system: {
                    cpuLoad1m: cpuLoad[0].toFixed(2),
                    memoryUsagePercent: memoryUsage,
                    platform: os.platform()
                },
                services: {
                    blockchainStatus,
                    ipfsStatus
                },
                api: apiMetrics,
                storage: {
                    totalFiles: totalStorageFiles
                },
                activity: {
                    activeUsers24h: activeUsersCount,
                    latestUploads,
                    latestVerifications
                }
            }
        });
    } catch (error) {
        next(error);
    }
};
