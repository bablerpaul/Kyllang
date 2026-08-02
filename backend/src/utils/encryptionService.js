const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

// Helper to securely retrieve the master encryption key from environment variables
const getMasterKey = () => {
    const secret = process.env.MASTER_ENCRYPTION_KEY || 'fallback_secret_key_for_dev_purposes_only';
    
    // Create a consistent 32-byte (256-bit) key from the secret string using SHA-256
    // This allows the environment variable to be any string while satisfying AES-256 requirements
    return crypto.createHash('sha256').update(String(secret)).digest();
};

/**
 * Encrypts a raw file buffer using AES-256-CBC.
 * @param {Buffer} buffer - The raw unencrypted file buffer.
 * @returns {Buffer} - The encrypted buffer with the IV prepended.
 */
exports.encryptFile = (buffer) => {
    const iv = crypto.randomBytes(16);
    const key = getMasterKey();
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encryptedBuffer = Buffer.concat([cipher.update(buffer), cipher.final()]);
    
    // Prepend the Initialization Vector (IV) for use during decryption
    return Buffer.concat([iv, encryptedBuffer]);
};

/**
 * Decrypts an encrypted file buffer using AES-256-CBC.
 * @param {Buffer} encryptedBufferWithIv - The encrypted buffer with the IV prepended.
 * @returns {Buffer} - The decrypted, original file buffer.
 */
exports.decryptFile = (encryptedBufferWithIv) => {
    // Extract the 16-byte IV from the beginning
    const iv = encryptedBufferWithIv.subarray(0, 16);
    const encryptedBuffer = encryptedBufferWithIv.subarray(16);
    const key = getMasterKey();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};
