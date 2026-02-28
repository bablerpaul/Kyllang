const crypto = require('crypto');
const Certificate = require('../models/Certificate');

// @desc    Generate a new certificate
// @route   POST /api/certificates
// @access  Private (Doctor only)
exports.createCertificate = async (req, res) => {
    try {
        const { patientId, diagnosis, remarks, validFrom, validUntil } = req.body;

        // Generate unique hash
        const hashData = `${patientId}-${req.user._id}-${Date.now()}`;
        const verificationHash = crypto
            .createHash('sha256')
            .update(hashData)
            .digest('hex');

        const certificate = await Certificate.create({
            patient: patientId,
            issuedBy: req.user._id, // Set by auth middleware
            diagnosis,
            remarks,
            validFrom,
            validUntil,
            verificationHash,
        });

        res.status(201).json(certificate);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get certificates for logged in user
// @route   GET /api/certificates
// @access  Private
exports.getMyCertificates = async (req, res) => {
    try {
        let certificates;

        if (req.user.role === 'doctor') {
            certificates = await Certificate.find({ issuedBy: req.user._id })
                .populate('patient', 'name email');
        } else {
            certificates = await Certificate.find({ patient: req.user._id })
                .populate('issuedBy', 'name specialty');
        }

        res.status(200).json(certificates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Verify certificate by hash and data
// @route   POST /api/certificates/verify
// @access  Public
exports.verifyCertificate = async (req, res) => {
    try {
        const { hash, data } = req.body;
        console.log("=== RAW REQ.BODY ===", JSON.stringify(req.body, null, 2));

        if (!hash || !data) {
            return res.status(400).json({ message: 'Hash and data are required for verification' });
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
                message: `Hash mismatch.\nBackend Received Data: ${JSON.stringify(req.body)}\nComputed Hash: ${expectedHash}\nExpected Hash: ${hash}`
            });
        }

        const certificate = await Certificate.findOne({
            verificationHash: hash,
        })
            .populate('patient', 'name email')
            .populate('issuedBy', 'name specialty');

        if (!certificate) {
            return res.status(404).json({ message: 'Certificate matches hash but not found in the database. It may have been revoked.' });
        }

        res.status(200).json({ valid: true, certificate });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
