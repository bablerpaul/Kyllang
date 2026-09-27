const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const blockchainContract = require('../blockchain');
const SecureFile = require('../src/modules/secure-storage/models/SecureFile');
const SecureDocument = require('../src/modules/secure-storage/models/SecureDocument');
const FileVersion = require('../src/modules/secure-storage/models/FileVersion');
const Appointment = require('../models/Appointment');
const LabReport = require('../models/LabReport');
const Prescription = require('../models/Prescription');
const Consent = require('../models/Consent');
const InsuranceClaim = require('../models/InsuranceClaim');
const CertificateRequest = require('../models/CertificateRequest');
const RefreshToken = require('../models/RefreshToken');
const { withCertificatePatients } = require('../services/certificatePatientService');
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
        const { 
            name, email, password, role, specialty, contactNumber, licenseNumber, department,
            dateOfBirth, gender, address, emergencyName, emergencyRelation, emergencyPhone,
            bloodGroup, allergies, chronicConditions, insuranceProvider, policyNumber
        } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Please provide name, email, password, and role' , error: 'Please provide name, email, password, and role'  });
        }

        if (role === 'doctor') {
            if (!specialty || !licenseNumber) {
                return res.status(400).json({ success: false, message: 'Please provide specialty and licenseNumber for doctors', error: 'Missing doctor fields' });
            }
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
            contactNumber,
            publicKey, // Store public key in DB
        });

        if (role === 'doctor') {
            try {
                const existingDoctor = await Doctor.findOne({ user: user._id });
                if (!existingDoctor) {
                    await Doctor.create({
                        user: user._id,
                        specialty,
                        licenseNumber,
                        department: department || undefined
                    });
                }
            } catch (docError) {
                await User.findByIdAndDelete(user._id);
                return res.status(400).json({ success: false, message: 'Failed to create doctor profile', error: docError.message });
            }
        } else if (role === 'general_user') {
            try {
                const existingPatient = await Patient.findOne({ user: user._id });
                if (!existingPatient) {
                    await Patient.create({
                        user: user._id,
                        dateOfBirth,
                        gender,
                        contactNumber,
                        address: address ? { street: address } : undefined,
                        emergencyContact: (emergencyName || emergencyPhone) ? { name: emergencyName, relationship: emergencyRelation, phone: emergencyPhone } : undefined,
                        bloodGroup: bloodGroup || 'Unknown',
                        allergies: allergies ? allergies.split(',').map(a => a.trim()).filter(Boolean) : [],
                        chronicConditions: chronicConditions ? chronicConditions.split(',').map(c => c.trim()).filter(Boolean) : []
                    });
                }
            } catch (patientError) {
                await User.findByIdAndDelete(user._id);
                return res.status(400).json({ success: false, message: 'Failed to create patient profile', error: patientError.message });
            }
        }

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
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * deleteUser
 * @description Deletes a non-admin user together with their own Doctor/Patient profile and sessions,
 * and unassigns them from doctor/patient assignment lists. Refuses (409) when the user still owns or
 * issued clinical/certificate records, so no orphaned records are created and nothing is cascade-deleted.
 * Audit logs are never touched.
 * DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!OBJECT_ID_RE.test(id)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID', error: 'Invalid user ID' });
        }

        if (String(req.user._id) === id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account', error: 'You cannot delete your own account' });
        }

        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: 'User not found', error: 'User not found' });
        }

        // Admin accounts are not managed through this endpoint (they are also hidden from getAllUsers).
        if (target.role === 'hospital_admin') {
            return res.status(403).json({ success: false, message: 'Admin accounts cannot be deleted', error: 'Admin accounts cannot be deleted' });
        }

        const doctorProfile = await Doctor.findOne({ user: target._id }).select('_id');
        const patientProfile = await Patient.findOne({ user: target._id }).select('_id');
        const dId = doctorProfile ? doctorProfile._id : null;
        const pId = patientProfile ? patientProfile._id : null;

        // Records that belong to / were issued by this user. If any exist, refuse instead of orphaning them.
        const or = (...conds) => ({ $or: conds.filter(Boolean) });
        const dependents = [
            ['appointments', Appointment, or(pId && { patient: pId }, dId && { doctor: dId })],
            ['medicalRecords', MedicalRecord, or(pId && { patient: pId }, dId && { doctor: dId })],
            ['labReports', LabReport, or(pId && { patient: pId }, dId && { orderedBy: dId }, dId && { doctor: dId })],
            ['prescriptions', Prescription, or(pId && { patient: pId }, dId && { doctor: dId })],
            ['consents', Consent, or(pId && { patient: pId }, { patientUser: target._id }, { grantedTo: target._id }, dId && { grantedToDoctor: dId })],
            ['insuranceClaims', InsuranceClaim, or(pId && { patient: pId }, { user: target._id }, { processedBy: target._id }, dId && { doctor: dId })],
            ['secureFiles', SecureFile, or(pId && { patient: pId }, dId && { doctor: dId })],
            ['secureDocuments', SecureDocument, or({ patient: target._id }, { uploader: target._id })],
            ['fileVersions', FileVersion, { uploadedBy: target._id }],
            ['patientDocuments', PatientDocument, { patient: target._id }],
            // Certificate.patient is canonically the Patient-profile _id; legacy records may hold the User _id.
            // Check both so a certificate can never slip past this guard.
            ['certificates', Certificate, or({ patient: target._id }, pId && { patient: pId }, { issuedBy: target._id }, dId && { doctor: dId })],
            ['certificateRequests', CertificateRequest, or({ patient: target._id }, { doctorRequested: target._id })],
        ];

        const blocking = {};
        for (const [label, Model, filter] of dependents) {
            const count = await Model.countDocuments(filter);
            if (count > 0) blocking[label] = count;
        }

        if (Object.keys(blocking).length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User still has associated records and cannot be deleted. Remove or reassign them first.',
                error: 'User has associated records',
                data: { blockingRecords: blocking },
            });
        }

        // Unassign from assignment lists, then remove sessions, profile and the user.
        await User.updateMany({ assignedPatients: target._id }, { $pull: { assignedPatients: target._id } });
        if (pId) await Doctor.updateMany({ assignedPatients: pId }, { $pull: { assignedPatients: pId } });
        if (dId) await Patient.updateMany({ assignedDoctors: dId }, { $pull: { assignedDoctors: dId } });
        await RefreshToken.deleteMany({ user: target._id });
        if (dId) await Doctor.deleteOne({ _id: dId });
        if (pId) await Patient.deleteOne({ _id: pId });
        await User.deleteOne({ _id: target._id });

        await AuditLog.create({
            actor: req.user._id,
            action: 'DELETE_USER',
            details: {
                deletedUserId: target._id,
                role: target.role,
                name: target.name,
                email: target.email,
                removedProfiles: { doctor: !!dId, patient: !!pId },
            }
        });

        res.status(200).json({ success: true, message: 'User deleted successfully', data: { deletedUserId: target._id, role: target.role } });
    } catch (error) {
        console.error('Error deleting user:', error);
        next(error);
    }
};

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


exports.getAllCertificates = async (req, res, next) => {
    try {
        const found = await Certificate.find().select('-secretSalt -encryptedCredential').populate('issuedBy', 'name email').sort({ createdAt: -1 }).lean();
        // `patient` is the Patient-profile _id (legacy records may hold a User _id) — describe it instead of populating as a User.
        const certificates = await withCertificatePatients(found);

        // Enrich with on-chain status
        const blockchainContract = require('../blockchain');
        const registry = blockchainContract.getContract ? blockchainContract.getContract('CertificateRegistry') : null;
        
        const enrichedCertificates = await Promise.all(certificates.map(async (cert) => {
            let onChainRevoked = false;
            let onChainStatusAvailable = false;
            
            if (registry && cert.publicCommitmentHash) {
                try {
                    const record = await registry.getCertificateRecord(cert.publicCommitmentHash);
                    // record returns: [issuer, issuedAt, revoked, exists]
                    onChainRevoked = record[2];
                    onChainStatusAvailable = true;
                } catch (err) {
                    console.error(`Blockchain lookup failed for ${cert._id}:`, err.message);
                }
            }
            
            return {
                ...cert,
                onChainRevoked,
                onChainStatusAvailable
            };
        }));

        res.status(200).json({ success: true, message: 'Certificates retrieved successfully', data: enrichedCertificates });
    } catch (error) {
        next(error);
    }
};
