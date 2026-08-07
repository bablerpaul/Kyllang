const AuditLog = require('../models/AuditLog');
const auditEmitter = require('../src/events/auditEmitter');

/**
 * getClientIp
 * @description Handles operations for getClientIp. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @returns {*} Return value
 */
const getClientIp = (req) => {
    if (!req) return '127.0.0.1';
    const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
};

/**
 * logAudit
 * @description Handles operations for logAudit. Explains parameters, return values and usage.
 * @param {*} param - param parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const logAudit = async ({ req, userId, action, resource, resourceId, hash, blockchainTransaction, details }) => {
    try {
        const activeUserId = userId || (req && req.user ? req.user._id : null);
        const ipAddress = getClientIp(req);

        const auditData = {
            user: activeUserId,
            actor: activeUserId,
            action: action, // Store as provided (e.g. 'EMR Upload', 'Delete')
            ipAddress,
            hash: hash || (details ? (details.dataHash || details.fileHash || details.hash || details.verificationHash) : null),
            blockchainHash: hash || (details ? (details.dataHash || details.fileHash || details.hash || details.verificationHash) : null),
            blockchainTransaction: blockchainTransaction || (details ? (details.transactionHash || details.txHash) : null),
            transactionHash: blockchainTransaction || (details ? (details.transactionHash || details.txHash) : null),
            details: {
                resource,
                resourceId,
                ...(details || {}),
            },
            timestamp: new Date(),
        };
        // Emit event to be processed in the background
        auditEmitter.emit('saveLog', auditData);
        
        // Return immediately so the API doesn't wait for DB insert
        return Promise.resolve(true);
    } catch (err) {
        console.error('Audit logging extraction error:', err.message);
        return Promise.resolve(false);
    }
};

module.exports = { logAudit, getClientIp };
