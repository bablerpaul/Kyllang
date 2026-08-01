const AuditLog = require('../models/AuditLog');

const getClientIp = (req) => {
    if (!req) return '127.0.0.1';
    const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
};

/**
 * Log an audit entry whenever a record is Created, Updated, Deleted, or Viewed.
 * Stores: User, Action, Timestamp, IP Address, Blockchain Transaction, Hash.
 */
const logAudit = async ({ req, userId, action, resource, resourceId, hash, blockchainTransaction, details }) => {
    try {
        const activeUserId = userId || (req && req.user ? req.user._id : null);
        const ipAddress = getClientIp(req);

        const auditData = {
            user: activeUserId,
            actor: activeUserId,
            action: action.toUpperCase(), // 'CREATED', 'UPDATED', 'DELETED', 'VIEWED', etc.
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

        const log = await AuditLog.create(auditData);
        return log;
    } catch (err) {
        console.error('Audit logging error:', err.message);
        return null;
    }
};

module.exports = { logAudit, getClientIp };
