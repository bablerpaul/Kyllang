const crypto = require('crypto');

/**
 * Key Management Service (KMS)
 * Centralizes all encryption key retrieval and enables seamless key rotation.
 */

const getHashKey = (secret) => {
    return crypto.createHash('sha256').update(String(secret)).digest();
};

// Define available keys based on environment
// 'v1' is mapped to the legacy fallback to ensure old IPFS files still decrypt properly
// 'v2' is mapped to the new proper MASTER_KEY
const keys = {
    v1: getHashKey(process.env.MASTER_ENCRYPTION_KEY || 'fallback_secret_key_for_dev_purposes_only'),
};

if (process.env.MASTER_KEY) {
    keys['v2'] = getHashKey(process.env.MASTER_KEY);
}

// Active Key is always the highest available version
const ACTIVE_KEY_ID = process.env.MASTER_KEY ? 'v2' : 'v1';

/**
 * Returns the currently active Key ID (e.g., 'v2').
 * Used for tagging newly encrypted files.
 * @returns {string} Key Version String
 */
exports.getActiveKeyId = () => ACTIVE_KEY_ID;

/**
 * Returns the 256-bit AES key for a given version.
 * @param {string} version - The version string (e.g., 'v1', 'v2')
 * @returns {Buffer} 32-byte key buffer
 */
exports.getKey = (version) => {
    // If a requested version doesn't exist, safely fallback to v1 to attempt decryption
    return keys[version] || keys['v1'];
};
