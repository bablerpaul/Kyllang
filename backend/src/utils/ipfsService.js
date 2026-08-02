// Utility to interact with IPFS Daemon HTTP API

/**
 * Uploads a raw buffer to IPFS.
 * @param {Buffer} fileBuffer - The encrypted file buffer to upload.
 * @param {String} fileName - Optional filename for IPFS.
 * @returns {Promise<String>} - Returns the IPFS CID (Hash).
 */
exports.uploadToIPFS = async (fileBuffer, fileName = 'encrypted_payload') => {
    const ipfsUrl = process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001/api/v0/add';
    
    // In Node.js environment, we use FormData to append the buffer
    const formData = new FormData();
    
    // Create a Blob from the Buffer to pass to FormData
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);

    const response = await fetch(ipfsUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Failed to upload to IPFS. Status: ${response.status}`);
    }

    const data = await response.json();
    
    // The IPFS /api/v0/add endpoint returns an object containing 'Hash'
    return data.Hash;
};

/**
 * Fetches a file from IPFS by its CID.
 * @param {String} cid - The IPFS CID to fetch.
 * @returns {Promise<Buffer>} - The fetched file buffer.
 */
exports.fetchFromIPFS = async (cid) => {
    // Standard IPFS gateway retrieval URL
    // e.g., http://127.0.0.1:8080/ipfs/<CID> or http://127.0.0.1:5001/api/v0/cat?arg=<CID>
    const gatewayUrl = (process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:5001/api/v0/cat?arg=') + cid;

    const response = await fetch(gatewayUrl, {
        method: 'POST' // API v0/cat usually expects POST
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS. Status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
};
