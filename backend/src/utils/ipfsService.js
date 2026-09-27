// Utility to interact with IPFS Daemon HTTP API
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const fallbackDir = path.join(__dirname, '../../uploads/fallback-storage');

// Ensure fallback directory exists
if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
}

/**
 * Uploads a raw buffer to IPFS.
 * @param {Buffer} fileBuffer - The encrypted file buffer to upload.
 * @param {String} fileName - Optional filename for IPFS.
 * @returns {Promise<String>} - Returns the IPFS CID (Hash).
 */
exports.uploadToIPFS = async (fileBuffer, fileName = 'encrypted_payload') => {
    if (process.env.TEST_MODE === 'true') {
        const cid = `mock_ipfs_cid_${Date.now()}`;
        fs.writeFileSync(path.join(fallbackDir, cid), fileBuffer);
        return cid;
    }

    const ipfsUrl = process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001/api/v0/add';
    
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName });

    try {
        const response = await axios.post(ipfsUrl, formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        return response.data.Hash;
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
            console.warn('IPFS Node unreachable, falling back to persistent local storage for dev/test.');
            const cid = `mock_ipfs_cid_${Date.now()}`;
            fs.writeFileSync(path.join(fallbackDir, cid), fileBuffer);
            return cid;
        }
        throw err;
    }
};

/**
 * Uploads a file stream directly to IPFS, avoiding RAM exhaustion.
 * @param {string} filePath - Path to the local file.
 * @param {string} fileName - Optional filename.
 * @returns {Promise<string>} - Returns the IPFS CID (Hash).
 */
exports.uploadStreamToIPFS = async (filePath, fileName = 'encrypted_payload') => {
    if (process.env.TEST_MODE === 'true') {
        const cid = `mock_ipfs_cid_${Date.now()}`;
        fs.copyFileSync(filePath, path.join(fallbackDir, cid));
        return cid;
    }

    const ipfsUrl = process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001/api/v0/add';
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), { filename: fileName });

    try {
        const response = await axios.post(ipfsUrl, formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        return response.data.Hash;
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
            console.warn('IPFS Node unreachable, falling back to persistent local storage for dev/test.');
            const cid = `mock_ipfs_cid_${Date.now()}`;
            // Use copyFileSync to copy the temp file to fallback-storage synchronously to guarantee persistence
            fs.copyFileSync(filePath, path.join(fallbackDir, cid));
            return cid;
        }
        throw err;
    }
};

/**
 * Fetches a file from IPFS by its CID.
 * @param {String} cid - The IPFS CID to fetch.
 * @returns {Promise<Buffer>} - The fetched file buffer.
 */
exports.fetchFromIPFS = async (cid) => {
    if (process.env.TEST_MODE === 'true' || cid.startsWith('mock_ipfs_cid_')) {
        // Prevent path traversal by strictly validating format
        if (!/^mock_ipfs_cid_\d+$/.test(cid)) {
            throw new Error('Invalid fallback CID format');
        }
        const fallbackPath = path.join(fallbackDir, cid);
        if (!fs.existsSync(fallbackPath)) {
            throw new Error(`Fallback file not found for CID: ${cid}`);
        }
        return fs.readFileSync(fallbackPath);
    }

    // Standard IPFS gateway retrieval URL
    const gatewayUrl = (process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:5001/api/v0/cat?arg=') + encodeURIComponent(cid);

    try {
        const response = await axios.post(gatewayUrl, null, {
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
            throw new Error(`IPFS Node unreachable. Cannot fetch real CID: ${cid}`);
        }
        throw err;
    }
};
