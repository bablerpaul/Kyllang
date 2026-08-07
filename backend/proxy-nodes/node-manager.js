// KYLLANG_V4: Proxy node manager — orchestrates the 5-node threshold cluster.
// Distributes VSS shares to configured nodes and collects partial re-encryptions.
// In production, each NODE_* env var points to a real HSM endpoint or cloud KMS URL.
// UPDATE: Now uses external HTTP API calls to decoupled Docker microservices.

const { splitSecret, verifyShare } = require('./pedersen-vss');
const axios = require('axios');

const NODE_CONFIGS = [
  { id: 1, name: 'Hospital Admin HSM',  endpoint: process.env.PROXY_NODE_1_URL || 'http://127.0.0.1:5001' },
  { id: 2, name: 'ER Hardware Node',    endpoint: process.env.PROXY_NODE_2_URL || 'http://127.0.0.1:5002' },
  { id: 3, name: 'Regional Proxy A',    endpoint: process.env.PROXY_NODE_3_URL || 'http://127.0.0.1:5003' },
  { id: 4, name: 'Regional Proxy B',    endpoint: process.env.PROXY_NODE_4_URL || 'http://127.0.0.1:5004' },
  { id: 5, name: 'Compliance Audit',    endpoint: process.env.PROXY_NODE_5_URL || 'http://127.0.0.1:5005' },
];

const THRESHOLD = parseInt(process.env.TPRE_THRESHOLD || '3', 10);

/**
 * Distributes VSS shares of a re-encryption key to the proxy node cluster.
 * Requires a valid ZK-PoCKD proof to proceed — prevents share distribution
 * without key binding verification.
 *
 * @param {string} rkSecret - hex string of the re-encryption key secret
 * @param {Object} zkPoCKDProof - { valid: boolean } ZK proof of correct key derivation
 * @returns {Promise<Array>} Array of { node, share, commitments } distributions
 */
async function distributeShares(rkSecret, zkPoCKDProof) {
  if (!zkPoCKDProof || !zkPoCKDProof.valid) {
    throw new Error('[NodeManager] ZK-PoCKD proof required — cannot distribute shares without key binding proof');
  }
  const { shares, commitments } = splitSecret(rkSecret, THRESHOLD, NODE_CONFIGS.length);

  // Verify all shares before distribution
  for (const share of shares) {
    if (!verifyShare(share, commitments)) {
      throw new Error(`[NodeManager] Share verification failed for index ${share.index}`);
    }
  }

  const distribution = shares.map((share, i) => ({
    node: NODE_CONFIGS[i],
    share,
    commitments,
  }));
  console.log(`[NodeManager] Distributed ${shares.length} shares (threshold: ${THRESHOLD})`);
  return distribution;
}

/**
 * Collects partial re-encryptions from the proxy node cluster.
 * Stops collecting once the threshold is met.
 * Nodes that fail (session proof invalid, offline, etc.) are logged and skipped.
 *
 * @param {Object} params
 * @param {Array} params.distributions - from distributeShares()
 * @param {string} params.encryptedPayload - Base64-encoded encrypted data
 * @param {string} params.vrfLookupToken - hex VRF token for the patient
 * @param {string} params.doctorAddress - Ethereum address of requesting doctor
 * @returns {Promise<Array>} Array of { partialCiphertext, nodeIndex } results
 */
async function collectAndReencrypt({ distributions, encryptedPayload, vrfLookupToken, doctorAddress }) {
  const results = [];
  for (const { node, share } of distributions) {
    try {
      const response = await axios.post(`${node.endpoint}/api/reencrypt`, {
        rkShare: share,
        encryptedPayload,
        vrfLookupToken,
        doctorAddress,
      }, { timeout: 5000 }); // 5s timeout per node
      
      results.push(response.data);
      if (results.length >= THRESHOLD) break;
    } catch (err) {
      console.warn(`[NodeManager] Node ${node.name} eval failed: ${err.message}`);
    }
  }
  if (results.length < THRESHOLD) {
    throw new Error(`[NodeManager] Insufficient threshold: got ${results.length}/${THRESHOLD} valid partial results`);
  }
  return results;
}

module.exports = { distributeShares, collectAndReencrypt, NODE_CONFIGS, THRESHOLD };
