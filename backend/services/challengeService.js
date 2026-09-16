'use strict';
/**
 * challengeService.js — Kyllang ZK Challenge-Response Nonce Manager
 *
 * Issues ephemeral, time-limited cryptographically secure challenge nonces
 * for the ZK verification protocol. Each nonce is:
 *   - 248-bit (31 bytes) masked — safe for BN128 scalar field
 *   - Stored server-side with 60-second TTL
 *   - Consumed once by the smart contract (on-chain) + once here (off-chain guard)
 *   - Backed by Redis when available; falls back to in-memory Map
 *
 * Session lifecycle:
 *   generateChallenge() → { nonce, sessionId, expiresIn }
 *     Verifier displays Challenge QR with { nonce, sessionId, callbackUrl }
 *   storeProofResult(sessionId, result)
 *     Patient's proof submission stores result keyed by sessionId
 *   pollSessionResult(sessionId)
 *     Verifier polls this to get proof result without trusting the backend
 *   validateAndConsumeChallenge(nonce)
 *     Backend burns the nonce after on-chain verification succeeds
 */

const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────────────────────
const SESSION_TTL_MS   = 300 * 1000;   // 300 seconds (5 mins) to allow for human interaction & WASM generation
const EVICTION_INTERVAL= 30 * 1000;   // Evict every 30 seconds
const FIELD_MASK_248   = (1n << 248n) - 1n; // BN128-safe mask

// ── In-Memory Store ────────────────────────────────────────────────────────
// Structure: Map<nonceHex, SessionEntry>
// SessionEntry: { sessionId, expiresAt, consumed, proofResult }
const nonceStore   = new Map();
const sessionStore = new Map(); // sessionId → nonceHex (reverse index)

// ── Redis Integration (optional) ───────────────────────────────────────────
let redisClient = null;
try {
    const { redisClient: rc } = require('../src/config/redisClient');
    redisClient = rc;
} catch (_) { /* Redis not available — use in-memory fallback */ }

// ── Eviction Loop ──────────────────────────────────────────────────────────
const evictionTimer = setInterval(() => {
    const now = Date.now();
    for (const [nonce, entry] of nonceStore) {
        if (entry.expiresAt < now) {
            sessionStore.delete(entry.sessionId);
            nonceStore.delete(nonce);
        }
    }
}, EVICTION_INTERVAL);
evictionTimer.unref(); // Don't keep process alive

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Generate a fresh 248-bit challenge nonce and associated session.
 * @returns {{ nonce: string, sessionId: string, expiresIn: number }}
 */
function generateChallenge() {
    // 31 bytes = 248 bits — safely under BN128 prime (254 bits)
    const rawBytes = crypto.randomBytes(31);
    const nonceBigInt = BigInt('0x' + rawBytes.toString('hex')) & FIELD_MASK_248;
    const nonce = '0x' + nonceBigInt.toString(16).padStart(62, '0');
    const sessionId = crypto.randomBytes(16).toString('hex');

    const entry = {
        sessionId,
        expiresAt: Date.now() + SESSION_TTL_MS,
        consumed:  false,
        proofResult: null,
    };

    nonceStore.set(nonce, entry);
    sessionStore.set(sessionId, nonce);

    // Mirror to Redis if available (fire-and-forget)
    if (redisClient && redisClient.isOpen) {
        const key = `zk:nonce:${nonce}`;
        redisClient.setEx(key, 300, JSON.stringify(entry)).catch(() => {});
        redisClient.setEx(`zk:session:${sessionId}`, 300, nonce).catch(() => {});
    }

    return { nonce, sessionId, expiresIn: SESSION_TTL_MS / 1000 };
}

/**
 * Validate that a nonce exists, is not expired, and has not been consumed.
 * @param {string} nonce  hex nonce string
 * @returns {{ valid: boolean, reason?: string, entry?: object }}
 */
function validateChallenge(nonce) {
    const entry = nonceStore.get(nonce);
    if (!entry) return { valid: false, reason: 'Nonce not found or already expired' };
    if (Date.now() > entry.expiresAt) {
        nonceStore.delete(nonce);
        sessionStore.delete(entry.sessionId);
        return { valid: false, reason: 'Nonce expired (TTL: 300s)' };
    }
    if (entry.consumed) return { valid: false, reason: 'Nonce already consumed' };
    return { valid: true, entry };
}

/**
 * Validate and atomically consume a nonce.
 * Called after on-chain verification succeeds to prevent double-submission.
 * @param {string} nonce
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateAndConsumeChallenge(nonce) {
    const result = validateChallenge(nonce);
    if (!result.valid) return result;

    // Atomic consumption
    result.entry.consumed = true;

    // Remove from Redis if available
    if (redisClient && redisClient.isOpen) {
        redisClient.del(`zk:nonce:${nonce}`).catch(() => {});
    }

    return { valid: true };
}

/**
 * Store the proof verification result keyed by sessionId.
 * Called by the backend after the smart contract verifies the proof.
 * The Verifier frontend polls this via GET /api/certificates/session/:sessionId
 * @param {string} sessionId
 * @param {object} result  { valid, commitmentHash, issuer, issuedAt, txHash }
 */
function storeProofResult(sessionId, result) {
    const nonce = sessionStore.get(sessionId);
    if (!nonce) return false;

    const entry = nonceStore.get(nonce);
    if (!entry) return false;

    entry.proofResult = { ...result, resolvedAt: Date.now() };

    if (redisClient && redisClient.isOpen) {
        redisClient.setEx(`zk:session:${sessionId}:result`, 300, JSON.stringify(entry.proofResult)).catch(() => {});
    }

    return true;
}

/**
 * Poll for the verification result of a session.
 * Returns null if the patient has not yet submitted their proof.
 * @param {string} sessionId
 * @returns {object|null}
 */
function pollSessionResult(sessionId) {
    const nonce = sessionStore.get(sessionId);
    if (!nonce) return null;
    const entry = nonceStore.get(nonce);
    return entry ? entry.proofResult : null;
}

/**
 * Get active session count (for monitoring/debugging)
 */
function getActiveSessionCount() {
    return nonceStore.size;
}

module.exports = {
    generateChallenge,
    validateChallenge,
    validateAndConsumeChallenge,
    storeProofResult,
    pollSessionResult,
    getActiveSessionCount,
};
