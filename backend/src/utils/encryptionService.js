const crypto = require('crypto');
const fs = require('fs');
const kmsService = require('../services/kmsService');

const ALGORITHM = 'aes-256-cbc';
const MAGIC_BYTES = Buffer.from('KMS\x01');

/**
 * Encrypts a raw file buffer using AES-256-CBC and KMS wrapper.
 * @param {Buffer} buffer - The raw unencrypted file buffer.
 * @returns {Buffer} - The encrypted buffer with KMS header and IV.
 */
exports.encryptFile = (buffer) => {
    const iv = crypto.randomBytes(16);
    const keyId = kmsService.getActiveKeyId();
    const key = kmsService.getKey(keyId);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encryptedBuffer = Buffer.concat([cipher.update(buffer), cipher.final()]);
    
    const versionBuf = Buffer.from(keyId);
    const versionLen = Buffer.from([versionBuf.length]);
    
    // Construct KMS payload: [MAGIC_BYTES] + [version length (1 byte)] + [version string] + [16 byte IV] + [ciphertext]
    return Buffer.concat([MAGIC_BYTES, versionLen, versionBuf, iv, encryptedBuffer]);
};

/**
 * Decrypts an encrypted file buffer using KMS resolution.
 * Backward compatible with legacy raw AES-256-CBC files.
 * @param {Buffer} encryptedBlob - The encrypted buffer.
 * @returns {Buffer} - The decrypted, original file buffer.
 */
exports.decryptFile = (encryptedBlob) => {
    const magic = encryptedBlob.subarray(0, 4);
    let key, iv, ciphertext;
    
    if (magic.equals(MAGIC_BYTES)) {
        // KMS File
        const versionLen = encryptedBlob.readUInt8(4);
        const keyId = encryptedBlob.subarray(5, 5 + versionLen).toString('utf8');
        const ivStart = 5 + versionLen;
        
        iv = encryptedBlob.subarray(ivStart, ivStart + 16);
        ciphertext = encryptedBlob.subarray(ivStart + 16);
        key = kmsService.getKey(keyId);
    } else {
        // Legacy V1 File (No Magic Bytes)
        iv = encryptedBlob.subarray(0, 16);
        ciphertext = encryptedBlob.subarray(16);
        key = kmsService.getKey('v1');
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/**
 * Encrypts a file using Node streams to avoid RAM exhaustion, applying KMS header.
 * @param {string} inputPath - Path to the original unencrypted file.
 * @param {string} outputPath - Path to save the encrypted file.
 * @returns {Promise<void>}
 */
exports.encryptFileStream = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        const iv = crypto.randomBytes(16);
        const keyId = kmsService.getActiveKeyId();
        const key = kmsService.getKey(keyId);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const readStream = fs.createReadStream(inputPath);
        const writeStream = fs.createWriteStream(outputPath);

        // Construct header
        const versionBuf = Buffer.from(keyId);
        const versionLen = Buffer.from([versionBuf.length]);
        
        // Write the KMS header and IV before piping the encrypted data
        writeStream.write(Buffer.concat([MAGIC_BYTES, versionLen, versionBuf, iv]));

        readStream.pipe(cipher).pipe(writeStream);

        writeStream.on('finish', () => resolve());
        readStream.on('error', (err) => reject(err));
        cipher.on('error', (err) => reject(err));
        writeStream.on('error', (err) => reject(err));
    });
};
