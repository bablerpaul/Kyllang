// KYLLANG_V4: VRF service — replaces static-salt patientID hashing (fixes Flaw 2).
// VRF_K(patientID) is deterministic per hospital key, pseudorandom to observers,
// and does NOT require the patient to be conscious or present.
// The hospital key K is now loaded dynamically from vaultService and wiped from memory.

const crypto = require('crypto');
const { fetchHospitalSecretFromVault } = require('./vaultService');

/**
 * Generates a deterministic, pseudorandom lookup token for a patient.
 * Replaces H(patientID || staticSalt) throughout the codebase.
 * @param {string} patientId — MongoDB ObjectId string or Aadhaar-equivalent
 * @returns {Promise<string>} hex token — safe to store on-chain or use as a DB index
 */
async function generateLookupToken(patientId) {
  // Fetch from the vault dynamically
  const keyBuffer = await fetchHospitalSecretFromVault();
  
  try {
    const token = crypto.createHmac('sha256', keyBuffer).update(String(patientId)).digest('hex');
    return token;
  } finally {
    // SECURITY: Zeroize the buffer immediately after use to prevent memory dumping
    if (keyBuffer && Buffer.isBuffer(keyBuffer)) {
      keyBuffer.fill(0);
    }
  }
}

/**
 * Verifies that a submitted token matches the VRF output for a patientId.
 * Constant-time comparison prevents timing attacks.
 */
async function verifyLookupToken(patientId, submittedToken) {
  const expected = await generateLookupToken(patientId);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(submittedToken, 'hex')
  );
}

module.exports = { generateLookupToken, verifyLookupToken };
