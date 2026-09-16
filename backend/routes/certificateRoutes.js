const express = require('express');
const router  = express.Router();

const { cacheRoute }              = require('../src/middlewares/cacheMiddleware');
const { protect, authorize }      = require('../middlewares/authMiddleware');
const { certificateVerifyLimiter }= require('../middlewares/rateLimiter');
const { certificateIssueRules }   = require('../validators/certificateValidator');
const { validate }                = require('../middlewares/validatorMiddleware');
const rateLimit                   = require('express-rate-limit');

const {
    createCertificate,
    getMyCertificates,
    getCertificateChallenge,
    pollVerificationSession,
    verifyCertificate,
    lookupCertificate,
    revokeCertificate,
} = require('../controllers/certificateController');

// ── Rate limiters ──────────────────────────────────────────────────────────
// Challenge issuance: 120 req/15min per IP (prevents nonce flooding)
const challengeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many challenge requests. Please wait.' },
});

// Session poll: 600 req/15min per IP (verifier polls every ~5s for 60s = 12 polls/session)
const sessionPollLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many session poll requests.' },
});

// ── Certificate CRUD ───────────────────────────────────────────────────────
router
    .route('/')
    .post(protect, authorize('doctor', 'hospital_admin'), certificateIssueRules(), validate, createCertificate)
    .get(protect, getMyCertificates);

router.put('/:id/revoke', protect, authorize('doctor', 'hospital_admin'), revokeCertificate);

// ── ZK Challenge-Response Endpoints ───────────────────────────────────────

/**
 * GET /api/certificates/lookup/:hash
 * Public hash-based lookup — no auth required.
 * Accepts publicCommitmentHash, verificationHash, blockchainTxHash, or _id.
 */
router.get('/lookup/:hash', lookupCertificate);

/**
 * GET /api/certificates/challenge
 * Issues an ephemeral 248-bit challenge nonce (60s TTL).
 * Public endpoint — no auth required (Verifier calls this without being logged in).
 */
router.get('/challenge', challengeLimiter, getCertificateChallenge);

/**
 * GET /api/certificates/session/:sessionId
 * Verifier polls this to get the proof result once Patient submits.
 * Public endpoint — sessionId is the only credential.
 */
router.get('/session/:sessionId', sessionPollLimiter, pollVerificationSession);

/**
 * POST /api/certificates/verify
 * Receives Groth16 proof from Patient's device.
 * Forwards to CertificateRegistry.verifyCertificateProof() on-chain.
 * Cache disabled (state-changing + nonce consumption must not be cached).
 */
router.post('/verify', certificateVerifyLimiter, verifyCertificate);

module.exports = router;
