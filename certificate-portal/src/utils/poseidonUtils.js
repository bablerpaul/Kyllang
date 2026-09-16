/**
 * poseidonUtils.js — BN128-Safe Field Packing & Poseidon Utilities
 *
 * Shared between:
 *   • Doctor's certificate issuance flow (computing commitment before sending to backend)
 *   • Patient's credential vault (recomputing commitment for proof generation)
 *   • zkProofWorker.js (witness computation)
 *
 * Security properties:
 *   • All string inputs are SHA-256 hashed then masked to 248 bits
 *     → prevents BN128 field modulus overflow (prime is 254 bits; 248-bit mask gives 6-bit safety margin)
 *   • 248-bit mask == (1n << 248n) - 1n, identical to the mask used in the circom circuit's input domain
 *   • Poseidon implementation from circomlibjs matches circomlib's Poseidon circuit exactly
 *   • generateSalt() returns 31 cryptographically random bytes → 248-bit entropy private salt
 */

// ── BN128 Field Constants ──────────────────────────────────────────────────
export const BN128_PRIME =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// 248-bit mask: all inputs masked here are guaranteed < BN128_PRIME
export const FIELD_MASK_248 = (1n << 248n) - 1n;

// ── Poseidon Instance Cache ────────────────────────────────────────────────
let _poseidon = null;

async function getPoseidon() {
    if (_poseidon) return _poseidon;
    // circomlibjs must be imported dynamically to support both browser and Worker contexts
    const { buildPoseidon } = await import('circomlibjs');
    _poseidon = await buildPoseidon();
    return _poseidon;
}

// ── SHA-256 Helper (browser-native SubtleCrypto) ──────────────────────────
async function sha256Hex(text) {
    const encoder  = new TextEncoder();
    const data     = encoder.encode(text);
    const hashBuf  = await crypto.subtle.digest('SHA-256', data);
    const hashArr  = Array.from(new Uint8Array(hashBuf));
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Pack a string into a BN128 scalar field element.
 * Computes SHA-256(input) as BigInt, then masks to 248 bits.
 *
 * @param {string} str - arbitrary string (patientId, diagnosisCode, etc.)
 * @returns {Promise<bigint>} field element safe for Poseidon input
 */
export async function packToField(str) {
    const hexDigest = await sha256Hex(String(str));
    return BigInt('0x' + hexDigest) & FIELD_MASK_248;
}

/**
 * Pack a Unix timestamp (number) directly as a BigInt field element.
 * Timestamps fit comfortably in 32 bits, far below BN128 prime.
 *
 * @param {number|Date} dateOrTimestamp
 * @returns {bigint}
 */
export function packTimestamp(dateOrTimestamp) {
    const ts = dateOrTimestamp instanceof Date
        ? Math.floor(dateOrTimestamp.getTime() / 1000)
        : Math.floor(Number(dateOrTimestamp));
    return BigInt(ts);
}

/**
 * Pack a hex salt string (from generateSalt()) to a BigInt field element.
 *
 * @param {string} saltHex - 62-char hex string (31 bytes)
 * @returns {bigint}
 */
export function packSalt(saltHex) {
    const hex = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
    return BigInt('0x' + hex) & FIELD_MASK_248;
}

/**
 * Generate a cryptographically random 248-bit secret salt.
 * Must be stored by the patient and NEVER transmitted in plaintext.
 *
 * @returns {string} 62-char hex string (0x-prefixed)
 */
export function generateSalt() {
    const bytes = new Uint8Array(31); // 248 bits
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return '0x' + hex;
}

/**
 * Compute the Poseidon4 commitment hash for a certificate.
 * This is the value registered on-chain and embedded in the ZK proof.
 *
 * commitment = Poseidon4(patientId_field, diagnosisCode_field, validFrom_field, salt_field)
 *
 * @param {string}       patientId     - patient UUID / MongoDB ObjectId string
 * @param {string}       diagnosisCode - ICD-11 code or diagnosis string
 * @param {number|Date}  validFrom     - certificate valid-from date
 * @param {string}       saltHex       - 62-char hex salt from generateSalt()
 * @returns {Promise<string>} decimal string representation of commitment (for snarkjs publicSignals)
 */
export async function computeCommitment(patientId, diagnosisCode, validFrom, saltHex) {
    const poseidon = await getPoseidon();
    const F = poseidon.F;

    const p = await packToField(patientId);
    const d = await packToField(diagnosisCode);
    const t = packTimestamp(validFrom);
    const s = packSalt(saltHex);

    const hashOut = poseidon([p, d, t, s]);
    // Return as decimal string matching snarkjs publicSignals format
    return F.toString(hashOut);
}

/**
 * Convert a commitment decimal string to bytes32 hex for on-chain use.
 *
 * @param {string} commitmentDecStr - decimal string from computeCommitment()
 * @returns {string} 0x-prefixed 64-char hex string
 */
export function commitmentToBytes32(commitmentDecStr) {
    return '0x' + BigInt(commitmentDecStr).toString(16).padStart(64, '0');
}

/**
 * Convert a nonce hex string (from GET /challenge) to BigInt for snarkjs input.
 *
 * @param {string} nonceHex - 0x-prefixed hex string from backend challenge
 * @returns {bigint}
 */
export function nonceHexToBigInt(nonceHex) {
    const hex = nonceHex.startsWith('0x') ? nonceHex.slice(2) : nonceHex;
    return BigInt('0x' + hex) & FIELD_MASK_248;
}

/**
 * Build the complete snarkjs input object for the certificate_proof circuit.
 *
 * @param {string} patientId
 * @param {string} diagnosisCode
 * @param {number|Date} validFrom
 * @param {string} saltHex
 * @param {string} expectedCommitmentDec - from computeCommitment()
 * @param {string} challengeNonceHex     - from GET /challenge
 * @returns {Promise<object>} snarkjs fullProve input
 */
export async function buildCircuitInput(
    patientId,
    diagnosisCode,
    validFrom,
    saltHex,
    expectedCommitmentDec,
    challengeNonceHex,
) {
    const p = await packToField(patientId);
    const d = await packToField(diagnosisCode);
    const t = packTimestamp(validFrom);
    const s = packSalt(saltHex);
    const nonce = nonceHexToBigInt(challengeNonceHex);

    // If the commitment was stored as a bytes32 hex string in the vault,
    // explicitly convert it to a decimal string for SnarkJS circuit input.
    let expectedCommitmentStr = String(expectedCommitmentDec).trim();
    if (expectedCommitmentStr.startsWith('0x')) {
        expectedCommitmentStr = BigInt(expectedCommitmentStr).toString();
    }

    return {
        // Private inputs (witness — never revealed)
        patientId:           p.toString(),
        diagnosisCode:       d.toString(),
        validFrom:           t.toString(),
        secretSalt:          s.toString(),
        // Public inputs (appear in publicSignals)
        expectedCommitment:  expectedCommitmentStr,
        challengeNonce:      nonce.toString(),
    };
}
