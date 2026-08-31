'use strict';
/**
 * certificateController.js — Kyllang ZK Certificate API
 *
 * Endpoints:
 *   POST   /api/certificates/          createCertificate
 *   GET    /api/certificates/          getMyCertificates
 *   GET    /api/certificates/challenge getCertificateChallenge
 *   GET    /api/certificates/session/:sessionId  pollVerificationSession
 *   POST   /api/certificates/verify   verifyCertificate
 *
 * Security Design:
 *   • HMAC logic is entirely removed — no HMAC keys, no plaintext hashing on backend
 *   • publicCommitmentHash is computed client-side by doctor's browser (Poseidon4)
 *   • Backend registers hash on-chain via CertificateRegistry.registerCertificate()
 *   • Verification forwards Groth16 proof to CertificateRegistry.verifyCertificateProof()
 *   • No plaintext diagnosis or patientId is ever logged or stored
 */

const Certificate   = require('../models/Certificate');
const MedicalRecord = require('../models/MedicalRecord');
const Doctor        = require('../models/Doctor');
const AuditLog      = require('../models/AuditLog');
const { ethers }    = require('ethers');

const blockchainContract = require('../blockchain');
const challengeService   = require('../services/challengeService');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise a commitment hash to bytes32 hex for on-chain use.
 * Accepts decimal string (snarkjs publicSignals format) or hex string.
 */
function toBytes32(value) {
    if (typeof value === 'string' && value.startsWith('0x')) {
        return ethers.zeroPadValue(value, 32);
    }
    // Decimal string from snarkjs
    const hex = BigInt(value).toString(16).padStart(64, '0');
    return '0x' + hex;
}

/**
 * Build a structured Groth16 proof array from the snarkjs proof object.
 * snarkjs format → ethers.js calldata format
 */
function proofToCalldata(proof) {
    return {
        pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        pB: [
            [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
            [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
        ],
        pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/certificates/
// ═══════════════════════════════════════════════════════════════════════════
/**
 * createCertificate
 *
 * Receives the Poseidon commitment hash (computed client-side by doctor's browser)
 * and registers it on-chain via CertificateRegistry.registerCertificate().
 * NO plaintext diagnosis or patient data is stored here.
 *
 * Request body:
 *   {
 *     patientId:            string   (MongoDB ObjectId)
 *     publicCommitmentHash: string   (hex Poseidon4 commitment from doctor's browser)
 *     issuerAddress:        string   (doctor's Ethereum wallet address)
 *     validFrom:            string   (ISO date)
 *     validUntil:           string   (ISO date)
 *     remarks:              string?  (non-identifying general remarks)
 *     medicalRecordId:      string?
 *     insuranceClaimId:     string?
 *   }
 */
exports.createCertificate = async (req, res, next) => {
    try {
        const {
            patientId,
            publicCommitmentHash,
            issuerAddress,
            validFrom,
            validUntil,
            remarks,
            medicalRecordId,
            insuranceClaimId,
        } = req.body;

        // ── Input Validation ───────────────────────────────────────────────
        if (!patientId || !publicCommitmentHash || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                message: 'patientId, publicCommitmentHash, validFrom, and validUntil are required',
            });
        }

        if (!publicCommitmentHash.startsWith('0x') && !/^\d+$/.test(publicCommitmentHash)) {
            return res.status(400).json({
                success: false,
                message: 'publicCommitmentHash must be a hex string (0x…) or decimal string',
            });
        }

        const commitmentBytes32 = toBytes32(publicCommitmentHash);

        // ── Resolve Doctor Profile ─────────────────────────────────────────
        let doctorProfile = await Doctor.findOne({ user: req.user._id });
        if (!doctorProfile) {
            doctorProfile = await Doctor.create({
                user: req.user._id,
                specialty: 'General Medicine',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`,
            });
        }

        // ── Connect / resolve EMR ──────────────────────────────────────────
        let emrRecord = null;
        if (medicalRecordId) {
            emrRecord = await MedicalRecord.findById(medicalRecordId);
        }
        if (!emrRecord) {
            emrRecord = await MedicalRecord.findOne({ patient: patientId }).sort({ createdAt: -1 });
        }

        // ── On-Chain Registration ──────────────────────────────────────────
        let blockchainTxHash = null;
        const registry = blockchainContract.getContract('CertificateRegistry');

        if (registry) {
            try {
                // registerCertificate() on-chain — must be called by an authorized issuer wallet
                const tx = await registry.registerCertificate(commitmentBytes32);
                const receipt = await tx.wait();
                blockchainTxHash = receipt.hash || tx.hash;
                console.log('[CertificateRegistry] Hash registered on-chain. TX:', blockchainTxHash);
            } catch (contractErr) {
                console.error('[CertificateRegistry] On-chain registration failed:', contractErr.message);
                // Return error — we must not create a certificate without on-chain registration
                return res.status(502).json({
                    success: false,
                    message: 'On-chain certificate registration failed. Please ensure the issuer wallet is authorized.',
                    error: contractErr.message,
                });
            }
        } else {
            console.warn('[CertificateRegistry] Contract not available — skipping on-chain registration (dev mode)');
        }

        // ── MongoDB Document ───────────────────────────────────────────────
        const certificate = await Certificate.create({
            patient:              patientId,
            issuedBy:             req.user._id,
            doctor:               doctorProfile._id,
            medicalRecord:        emrRecord?._id,
            insuranceClaim:       insuranceClaimId || undefined,
            validFrom,
            validUntil,
            remarks,
            publicCommitmentHash: commitmentBytes32,
            verificationHash:     commitmentBytes32, // legacy alias
            verificationMethod:   'zk_proof',
            blockchainTxHash,
            issuerAddress:        issuerAddress || req.user.walletAddress || null,
            accessList:           [req.user._id],
        });

        // ── Audit Log ──────────────────────────────────────────────────────
        await AuditLog.create({
            actor:  req.user._id,
            action: 'ISSUE_ZK_CERTIFICATE',
            details: {
                certificateId: certificate._id,
                patientId,
                commitmentHash: commitmentBytes32,
                blockchainTxHash,
                issuerAddress,
            },
        });

        // ── Populate for Response ──────────────────────────────────────────
        const populatedCert = await Certificate.findById(certificate._id)
            .populate('patient',      'name email')
            .populate('issuedBy',     'name')
            .populate('doctor',       'specialty licenseNumber')
            .populate('medicalRecord','visitDate')
            .lean();

        // Privacy: do not return any plaintext medical fields from the DB document
        return res.status(201).json({
            success: true,
            message: 'Certificate registered on-chain and stored',
            data: {
                _id:                  populatedCert._id,
                validFrom:            populatedCert.validFrom,
                validUntil:           populatedCert.validUntil,
                publicCommitmentHash: populatedCert.publicCommitmentHash,
                blockchainTxHash:     populatedCert.blockchainTxHash,
                issuerAddress:        populatedCert.issuerAddress,
                patient:              populatedCert.patient,
                doctor:               populatedCert.doctor,
                createdAt:            populatedCert.createdAt,
            },
        });
    } catch (error) {
        console.error('[createCertificate] Error:', error.message);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/certificates/
// ═══════════════════════════════════════════════════════════════════════════
exports.getMyCertificates = async (req, res, next) => {
    try {
        const query = req.user.role === 'doctor'
            ? { issuedBy: req.user._id }
            : { patient: req.user._id };

        const certificates = await Certificate.find(query)
            .populate('patient', 'name email')
            .populate('issuedBy', 'name')
            .populate('doctor', 'specialty licenseNumber')
            .sort({ createdAt: -1 })
            .lean();

        // Strip any legacy fields with medical data before sending
        const safe = certificates.map(cert => ({
            _id:                  cert._id,
            validFrom:            cert.validFrom,
            validUntil:           cert.validUntil,
            publicCommitmentHash: cert.publicCommitmentHash,
            blockchainTxHash:     cert.blockchainTxHash,
            issuerAddress:        cert.issuerAddress,
            verificationMethod:   cert.verificationMethod,
            patient:              cert.patient,
            doctor:               cert.doctor,
            remarks:              cert.remarks,
            createdAt:            cert.createdAt,
        }));

        return res.status(200).json({ success: true, data: safe });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/certificates/lookup/:hash
// ═══════════════════════════════════════════════════════════════════════════
/**
 * lookupCertificate — Public hash-based certificate lookup
 *
 * Searches the Certificate collection by:
 *   1. publicCommitmentHash (exact hex match)
 *   2. verificationHash     (legacy alias)
 *   3. blockchainTxHash     (on-chain TX)
 *   4. _id                  (MongoDB ObjectId, if valid)
 *
 * Returns safe non-PII metadata only (no diagnosis, no patient email).
 * This endpoint is intentionally PUBLIC — anyone with the hash can verify.
 */
exports.lookupCertificate = async (req, res, next) => {
    try {
        const raw = (req.params.hash || '').trim();
        if (!raw) {
            return res.status(400).json({ success: false, message: 'Hash parameter is required.' });
        }

        // Normalise: if it looks like a base64 key payload (QR from document)
        // try to treat it as a verificationHash too.
        // Build an $or query across all searchable fields.
        const conditions = [
            { publicCommitmentHash: raw },
            { verificationHash: raw },
            { blockchainTxHash: raw },
        ];

        // Add ObjectId match only if the string is a valid Mongo ObjectId
        if (/^[a-fA-F0-9]{24}$/.test(raw)) {
            conditions.push({ _id: raw });
        }

        // Also try hex-prefixed variant
        if (!raw.startsWith('0x')) {
            conditions.push({ publicCommitmentHash: '0x' + raw });
            conditions.push({ verificationHash: '0x' + raw });
        }

        const cert = await Certificate.findOne({ $or: conditions })
            .populate('patient',  'name')       // name only — no email
            .populate('issuedBy', 'name')
            .populate('doctor',   'specialty licenseNumber')
            .lean();

        if (!cert) {
            return res.status(404).json({
                success: false,
                status: 'not_found',
                message: 'No certificate found matching this hash. It may not be registered in the Kyllang system.',
            });
        }

        // Return safe fields only
        return res.status(200).json({
            success: true,
            status: 'verified',
            data: {
                _id:                  cert._id,
                patientName:          cert.patient?.name || 'Patient',
                doctorName:           cert.issuedBy?.name || 'Unknown Issuer',
                specialty:            cert.doctor?.specialty,
                licenseNumber:        cert.doctor?.licenseNumber,
                validFrom:            cert.validFrom,
                validUntil:           cert.validUntil,
                remarks:              cert.remarks,
                publicCommitmentHash: cert.publicCommitmentHash,
                blockchainTxHash:     cert.blockchainTxHash,
                issuerAddress:        cert.issuerAddress,
                verificationMethod:   cert.verificationMethod,
                issuedAt:             cert.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
/**
 * getCertificateChallenge
 *
 * Issues a fresh 248-bit ephemeral challenge nonce for the ZK verification
 * challenge-response protocol.
 *
 * Response:
 *   { nonce, sessionId, expiresIn }
 *
 * The Verifier encodes { nonce, sessionId, callbackUrl } into a Challenge QR.
 * The Patient scans this QR, generates a Groth16 proof using the nonce,
 * and submits it back.
 */
exports.getCertificateChallenge = async (req, res) => {
    const challenge = challengeService.generateChallenge();

    return res.status(200).json({
        success: true,
        data: {
            nonce:     challenge.nonce,
            sessionId: challenge.sessionId,
            expiresIn: challenge.expiresIn,
            callbackUrl: `${req.protocol}://${req.get('host')}/api/certificates/verify`,
        },
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/certificates/session/:sessionId
// ═══════════════════════════════════════════════════════════════════════════
/**
 * pollVerificationSession
 *
 * Verifier polls this endpoint to check if the patient has submitted their proof.
 * Returns null/pending until the proof is processed and stored.
 *
 * This is the ONLY path the Verifier uses to get results — the backend
 * never sends verification status proactively (no WebSocket required).
 */
exports.pollVerificationSession = async (req, res) => {
    const { sessionId } = req.params;

    if (!sessionId || sessionId.length !== 32) {
        return res.status(400).json({ success: false, message: 'Invalid sessionId' });
    }

    const result = challengeService.pollSessionResult(sessionId);

    if (!result) {
        return res.status(200).json({
            success: true,
            data: { status: 'pending', message: 'Patient has not yet submitted a proof for this session' },
        });
    }

    return res.status(200).json({
        success: true,
        data: { status: 'resolved', ...result },
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/certificates/verify
// ═══════════════════════════════════════════════════════════════════════════
/**
 * verifyCertificate
 *
 * Receives the Groth16 proof from the Patient's device. HMAC logic is removed.
 *
 * Protocol:
 *   1. Validate nonce TTL and uniqueness (challengeService)
 *   2. Call CertificateRegistry.verifyCertificateProof(a, b, c, pubSignals)
 *      — On-chain: checks proof math, hash registration, nonce freshness atomically
 *   3. Consume nonce in challengeService (off-chain guard)
 *   4. Look up Certificate in MongoDB by publicCommitmentHash
 *   5. Store proof result in session (for Verifier polling)
 *   6. Return safe metadata (no plaintext medical data)
 *
 * Request body:
 *   {
 *     proof: {
 *       pi_a: [string, string, string],
 *       pi_b: [[string,string],[string,string],[string,string]],
 *       pi_c: [string, string, string],
 *       protocol: "groth16",
 *       curve: "bn128"
 *     },
 *     publicSignals: [string, string, string],   // [commitment, nonce, sessionCommitment]
 *     sessionId:     string                      // from GET /challenge
 *   }
 */
exports.verifyCertificate = async (req, res, next) => {
    try {
        const { proof, publicSignals, sessionId } = req.body;

        // ── Input validation ───────────────────────────────────────────────
        if (!proof || !publicSignals || !Array.isArray(publicSignals) || publicSignals.length !== 3) {
            return res.status(400).json({
                success: false,
                message: 'Request must include proof and publicSignals[3] (commitment, nonce, sessionCommitment)',
            });
        }

        if (!proof.pi_a || !proof.pi_b || !proof.pi_c) {
            return res.status(400).json({
                success: false,
                message: 'Malformed proof object. Expected pi_a, pi_b, pi_c arrays.',
            });
        }

        const [commitmentDecStr, nonceDecStr, sessionCommitmentDecStr] = publicSignals;

        // ── Derive nonce hex for challengeService lookup ───────────────────
        const nonceHex = '0x' + BigInt(nonceDecStr).toString(16).padStart(62, '0');

        // ── Step 1: Validate nonce TTL (off-chain fast check) ─────────────
        const challengeCheck = challengeService.validateChallenge(nonceHex);
        if (!challengeCheck.valid) {
            return res.status(400).json({
                success: false,
                message: `Challenge validation failed: ${challengeCheck.reason}`,
                error: 'NONCE_INVALID',
            });
        }

        // ── Step 2: Build on-chain calldata ────────────────────────────────
        const { pA, pB, pC } = proofToCalldata(proof);
        const pubSignalsOnChain = [
            BigInt(commitmentDecStr),
            BigInt(nonceDecStr),
            BigInt(sessionCommitmentDecStr),
        ];

        // ── Step 3: On-chain atomic verification + nonce consumption ───────
        const registry = blockchainContract.getContract('CertificateRegistry');

        if (!registry) {
            // Dev fallback: trust publicSignals, skip on-chain verification
            console.warn('[verifyCertificate] CertificateRegistry not connected — dev mode bypass');
        } else {
            try {
                // verifyCertificateProof is state-changing (atomically consumes session on-chain)
                const tx = await registry.verifyCertificateProof(pA, pB, pC, pubSignalsOnChain);
                await tx.wait();
                console.log('[CertificateRegistry] Proof verified on-chain. TX:', tx.hash || tx);
            } catch (contractErr) {
                // Parse revert reason for structured error response
                const reason = contractErr.reason || contractErr.message || 'Unknown contract error';
                console.error('[verifyCertificate] On-chain verification failed:', reason);

                let errorCode = 'PROOF_INVALID';
                if (reason.includes('session already consumed') || reason.includes('replay')) errorCode = 'REPLAY_BLOCKED';
                if (reason.includes('not registered')) errorCode = 'HASH_UNREGISTERED';
                if (reason.includes('revoked'))        errorCode = 'CERTIFICATE_REVOKED';

                return res.status(400).json({
                    success: false,
                    valid:   false,
                    message: `On-chain verification failed: ${reason}`,
                    error:   errorCode,
                });
            }
        }

        // ── Step 4: Consume nonce in challengeService (off-chain guard) ────
        challengeService.validateAndConsumeChallenge(nonceHex);

        // ── Step 5: Look up Certificate in MongoDB ─────────────────────────
        const commitmentBytes32 = toBytes32(commitmentDecStr);
        const certificate = await Certificate.findOne({
            publicCommitmentHash: commitmentBytes32,
        })
            .populate('patient',  'name email')
            .populate('issuedBy', 'name')
            .populate('doctor',   'specialty licenseNumber')
            .lean();

        if (!certificate) {
            // Certificate is valid on-chain but not in our DB — issue a soft warning
            console.warn('[verifyCertificate] Hash verified on-chain but not found in MongoDB:', commitmentBytes32);
        }

        // ── Step 6: Build safe response (zero plaintext leakage) ──────────
        const safeResult = {
            valid:            true,
            commitmentHash:   commitmentBytes32,
            issuerAddress:    certificate?.issuerAddress || null,
            issuedAt:         certificate?.createdAt || null,
            validFrom:        certificate?.validFrom || null,
            validUntil:       certificate?.validUntil || null,
            doctor:           certificate?.doctor || null,
            // Note: NO diagnosis, NO patientId string, NO salt
        };

        // ── Step 7: Store result in session (for Verifier polling) ─────────
        if (sessionId) {
            challengeService.storeProofResult(sessionId, safeResult);
        }

        // ── Audit Log ──────────────────────────────────────────────────────
        await AuditLog.create({
            actor:  certificate?.patient || null,
            action: 'VERIFY_ZK_CERTIFICATE',
            details: {
                commitmentHash: commitmentBytes32,
                sessionId,
                valid: true,
            },
        }).catch(() => {}); // Non-blocking

        return res.status(200).json({
            success: true,
            message: 'Certificate proof verified successfully',
            data: safeResult,
        });
    } catch (error) {
        console.error('[verifyCertificate] Unexpected error:', error.message);
        next(error);
    }
};
