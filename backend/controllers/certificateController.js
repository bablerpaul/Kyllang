const crypto = require('crypto');
const Certificate = require('../models/Certificate');
const MedicalRecord = require('../models/MedicalRecord');
const Doctor = require('../models/Doctor');

const AuditLog = require('../models/AuditLog');
const blockchainContract = require('../blockchain');

/**
 * createCertificate
 * @description Handles operations for createCertificate. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createCertificate = async (req, res, next) => {
    try {
        const { patientId, diagnosis, remarks, validFrom, validUntil, medicalRecordId, emrId, insuranceClaimId } = req.body;

        if (!patientId || !diagnosis || !validFrom || !validUntil) {
            return res.status(400).json({ success: false, message: 'patientId, diagnosis, validFrom, and validUntil are required' , error: 'patientId, diagnosis, validFrom, and validUntil are required'  });
        }

        // Connect certificate to an existing EMR
        const targetEmrId = medicalRecordId || emrId;
        let emrRecord = null;

        if (targetEmrId) {
            emrRecord = await MedicalRecord.findById(targetEmrId);
        }

        // Auto-resolve or find existing MedicalRecord for this patient if not explicitly supplied
        if (!emrRecord) {
            emrRecord = await MedicalRecord.findOne({
                $or: [{ patient: patientId }]
            }).sort({ createdAt: -1 });

            if (!emrRecord) {
                let doctorDoc = await Doctor.findOne({ user: req.user._id });
                if (!doctorDoc) {
                    doctorDoc = await Doctor.create({
                        user: req.user._id,
                        specialty: 'General Medicine',
                        licenseNumber: `DOC-${req.user._id.toString().substring(18)}`,
                    });
                }
                emrRecord = await MedicalRecord.create({
                    patient: patientId,
                    doctor: doctorDoc._id,
                    diagnosis,
                    chiefComplaint: 'Medical Certificate Evaluation',
                    visitDate: new Date(validFrom),
                });
            }
        }

        // Resolve Doctor profile
        let doctorProfile = await Doctor.findOne({ user: req.user._id });
        if (!doctorProfile) {
            doctorProfile = await Doctor.create({
                user: req.user._id,
                specialty: 'General Medicine',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`,
            });
        }

        // Generate HMAC verification hash
        const hashString = `${patientId}|${diagnosis}|${validFrom}|${validUntil}`;
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const verificationHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        // Store hash on blockchain (calling storeEMRRecord on EMRRegistry.sol)
        let transactionHash = null;
        try {
            const tx = await blockchainContract.storeEMRRecord(
                patientId.toString(),
                'MedicalCertificate',
                verificationHash,
                ''
            );
            await tx.wait();
            transactionHash = tx.hash;
            console.log("Certificate hash anchored to blockchain! TX Hash:", tx.hash);
        } catch (contractError) {
            console.error("Blockchain contract call failed:", contractError.message);
        }

        const certificate = await Certificate.create({
            patient: patientId,
            issuedBy: req.user._id,
            doctor: doctorProfile._id,
            medicalRecord: emrRecord._id,
            insuranceClaim: insuranceClaimId || undefined,
            diagnosis,
            remarks,
            validFrom,
            validUntil,
            verificationHash,
            blockchainHash: transactionHash || verificationHash,
            transactionHash: transactionHash,
            accessList: [req.user._id],
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'ISSUE_CERTIFICATE',
            details: { certificateId: certificate._id, patientId, emrId: emrRecord._id, transactionHash }
        });

        const populatedCert = await Certificate.findById(certificate._id)
            .populate('patient', 'name email')
            .populate('issuedBy', 'name specialty')
            .populate('doctor', 'specialty licenseNumber')
            .populate('medicalRecord', 'diagnosis visitDate vitals clinicalNotes')
            .populate('insuranceClaim', 'provider policyNumber claimAmount status')
            .lean();

        res.status(201).json({ success: true, message: 'Operation successful', data: populatedCert });
    } catch (error) {
        console.error('Error in createCertificate:', error);
        next(error);
    }
};

/**
 * getMyCertificates
 * @description Handles operations for getMyCertificates. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getMyCertificates = async (req, res, next) => {
    try {
        let certificates;

        if (req.user.role === 'doctor') {
            certificates = await Certificate.find({ issuedBy: req.user._id })
                .populate('patient', 'name email')
                .populate('issuedBy', 'name specialty')
                .populate('doctor', 'specialty licenseNumber')
                .populate('medicalRecord', 'diagnosis visitDate vitals clinicalNotes')
                .populate('insuranceClaim', 'provider policyNumber claimAmount status')
                .sort({ createdAt: -1 })
                .lean();
        } else {
            certificates = await Certificate.find({ patient: req.user._id })
                .populate('issuedBy', 'name specialty')
                .populate('doctor', 'specialty licenseNumber')
                .populate('medicalRecord', 'diagnosis visitDate vitals clinicalNotes')
                .populate('insuranceClaim', 'provider policyNumber claimAmount status')
                .sort({ createdAt: -1 })
                .lean();
        }

        res.status(200).json({ success: true, message: 'Operation successful', data: certificates });
    } catch (error) {
        next(error);
    }
};

/**
 * verifyCertificate
 * @description Handles operations for verifyCertificate. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.verifyCertificate = async (req, res, next) => {
    try {
        // KYLLANG_V4: Destructure verificationMethod and zkNullifier for dual-path routing
        const { hash, data, verificationMethod = 'hmac_legacy', zkNullifier, zkProof } = req.body;
        console.log("=== RAW REQ.BODY ===", JSON.stringify(req.body, null, 2));

        if (verificationMethod === 'zk_proof') {
            if (!zkNullifier) {
                return res.status(400).json({ success: false, message: 'zkNullifier is required for ZK verification' });
            }

            // KYLLANG_V4: Fix ZKP Race Condition
            // We must verify and consume the nullifier on-chain BEFORE returning any off-chain data
            const blockchain = require('../blockchain');
            const zkContract = blockchain.getContract && blockchain.getContract('ZKVerifier');
            
            if (zkContract && (process.env.NODE_ENV === 'production' || process.env.TEST_MODE === 'true')) {
                try {
                    const consumed = await zkContract.isNullifierConsumed(zkNullifier);
                    if (consumed) {
                        return res.status(403).json({ success: false, message: 'ZK Nullifier already consumed (Replay attack)', error: 'Replay attack' });
                    }
                    
                    // Submit transaction and wait for block confirmation
                    const tx = await zkContract.consumeNullifier(zkNullifier);
                    await tx.wait();
                } catch (e) {
                    console.error('[ZKVerifier] Check or consumption failed', e);
                    return res.status(500).json({ success: false, message: 'Blockchain verification failed', error: e.message });
                }
            }

            const certificate = await Certificate.findOne({ zkNullifier })
                .populate('patient', 'name email')
                .populate('issuedBy', 'name specialty')
                .populate('doctor', 'specialty licenseNumber')
                .populate('medicalRecord', 'diagnosis visitDate vitals clinicalNotes')
                .populate('insuranceClaim', 'provider policyNumber claimAmount status')
                .lean();

            if (!certificate) {
                return res.status(404).json({ success: false, message: 'Certificate matches nullifier but not found in the database. It may have been revoked.', error: 'Not found' });
            }

            return res.status(200).json({ success: true, message: 'Operation successful', data: { valid: true, certificate } });
        }

        // --- LEGACY HMAC PATH ---
        if (!hash || !data) {
            return res.status(400).json({ success: false, message: 'Hash and data are required for verification' , error: 'Hash and data are required for verification'  });
        }

        // Recompute hash (ZKP concept verification)
        const hashString = `${data.patientId}|${data.diagnosis}|${data.validFrom}|${data.validUntil}`;
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const expectedHash = crypto.createHmac('sha256', secret).update(hashString).digest('hex');

        console.log("=== VERIFY HASH FIX ===");
        console.log("Received Hash:", hash);
        console.log("Expected Hash:", expectedHash);
        console.log("Data piped string:", hashString);

        if (hash !== expectedHash) {
            return res.status(400).json({
                success: true,
                message: `Hash mismatch.\nBackend Received Data: ${JSON.stringify(req.body)}\nComputed Hash: ${expectedHash}\nExpected Hash: ${hash}`,
                data: {}
            });
        }

        const certificate = await Certificate.findOne({
            verificationHash: hash,
        })
            .populate('patient', 'name email')
            .populate('issuedBy', 'name specialty')
            .populate('doctor', 'specialty licenseNumber')
            .populate('medicalRecord', 'diagnosis visitDate vitals clinicalNotes')
            .populate('insuranceClaim', 'provider policyNumber claimAmount status')
            .lean();

        if (!certificate) {
            return res.status(404).json({ success: false, message: 'Certificate matches hash but not found in the database. It may have been revoked.' , error: 'Certificate matches hash but not found in the database. It may have been revoked.'  });
        }

        res.status(200).json({ success: true, message: 'Operation successful', data: { valid: true, certificate } });
    } catch (error) {
        next(error);
    }
};
