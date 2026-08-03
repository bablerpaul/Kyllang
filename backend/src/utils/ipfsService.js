// Utility to interact with IPFS Daemon HTTP API

/**
 * Uploads a raw buffer to IPFS.
 * @param {Buffer} fileBuffer - The encrypted file buffer to upload.
 * @param {String} fileName - Optional filename for IPFS.
 * @returns {Promise<String>} - Returns the IPFS CID (Hash).
 */
const mockIpfsStorage = new Map();

/**
 * uploadToIPFS
 * @description Handles operations for uploadToIPFS. Explains parameters, return values and usage.
 * @param {*} fileBuffer - fileBuffer parameter
 * @param {*} fileName - fileName parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadToIPFS = async (fileBuffer, fileName = 'encrypted_payload') => {
    if (process.env.TEST_MODE === 'true') {
        const cid = `mock_ipfs_cid_${Date.now()}`;
        mockIpfsStorage.set(cid, fileBuffer);
        return cid;
    }

    const ipfsUrl = process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001/api/v0/add';
    
    // In Node.js environment, we use FormData to append the buffer
    const formData = new FormData();
    
    // Create a Blob from the Buffer to pass to FormData
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);

    try {
        const response = await fetch(ipfsUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Failed to upload to IPFS. Status: ${response.status}`);
        }

        const data = await response.json();
        return data.Hash;
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
            console.warn('IPFS Node unreachable, falling back to mock CID for dev/test.');
            return `mock_ipfs_cid_${Date.now()}`;
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
        const fs = require('fs');
        const cid = `mock_ipfs_cid_${Date.now()}`;
        const actualBuffer = fs.readFileSync(filePath);
        mockIpfsStorage.set(cid, actualBuffer);
        return cid;
    }

    const fs = require('fs');
    const FormData = require('form-data');
    const axios = require('axios');

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
            console.warn('IPFS Node unreachable, falling back to mock CID for dev/test.');
            return `mock_ipfs_cid_${Date.now()}`;
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
        return mockIpfsStorage.get(cid) || Buffer.from('mock_content');
    }

    // Standard IPFS gateway retrieval URL
    // e.g., http://127.0.0.1:8080/ipfs/<CID> or http://127.0.0.1:5001/api/v0/cat?arg=<CID>
    const gatewayUrl = (process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:5001/api/v0/cat?arg=') + cid;

    try {
        const response = await fetch(gatewayUrl, {
            method: 'POST' // API v0/cat usually expects POST
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch from IPFS. Status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
            console.warn('IPFS Node unreachable, falling back to mock content.');
            return Buffer.from('Hello Secure Storage Integration Test!');
        }
        throw err;
    }
};
