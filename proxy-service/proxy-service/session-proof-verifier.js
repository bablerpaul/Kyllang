// KYLLANG_V4: π_session verifier — proxy nodes call this BEFORE re-encrypting.
// Queries the on-chain EmergencyEscrow / ZKVerifier to confirm an active authorized
// session exists for the given VRF lookup token at the current block.
// Fixes Flaw 4: colluding nodes cannot re-encrypt without a valid on-chain session.

const { getContract } = require('./blockchain');

/**
 * Returns true only if an active, unexpired session exists on-chain for this token.
 * Fails closed — any error returns false (no session proof = no re-encryption).
 * @param {string} vrfLookupToken — hex token from vrfService.generateLookupToken()
 * @param {string} requestingDoctorAddress — Ethereum address of the requesting doctor
 * @returns {Promise<boolean>}
 */
async function verifySessionOnChain(vrfLookupToken, requestingDoctorAddress) {
  try {
    const contract = getContract('EmergencyEscrow');
    if (!contract) {
      console.warn('[SessionVerifier] EmergencyEscrow contract not available');
      return false;
    }

    const vrfBytes32 = '0x' + vrfLookupToken.slice(0, 64);
    const session = await contract.getSession(vrfBytes32, requestingDoctorAddress);
    const now = Math.floor(Date.now() / 1000);
    return session.active === true && Number(session.expiresAt) > now;
  } catch (err) {
    console.error('[SessionVerifier] On-chain check failed:', err.message);
    return false; // fail closed — no session proof = no re-encryption
  }
}

module.exports = { verifySessionOnChain };
