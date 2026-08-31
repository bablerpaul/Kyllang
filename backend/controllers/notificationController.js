'use strict';
/**
 * notificationController.js
 *
 * Generates real system notifications for the admin dashboard by inspecting:
 *   - Blockchain status (offline / contract unavailable)
 *   - Redis cache status (ECONNREFUSED → caching bypassed)
 *   - Unanchored audit logs (> threshold → warn admin)
 *   - Quarantined audit log entries (canary scanner)
 *   - Recent 500 API errors (from AuditLog SYSTEM_ERROR entries)
 *   - Backup worker status
 *
 * Also exposes:
 *   GET  /api/admin/notifications        — list unread + recent
 *   PATCH /api/admin/notifications/:id   — mark single as read
 *   PATCH /api/admin/notifications/read-all — mark all as read
 *   POST  /api/admin/notifications       — (internal) create a notification
 */

const SystemNotification = require('../models/SystemNotification');
const AuditLog           = require('../models/AuditLog');
const blockchainContract = require('../blockchain');
const os                 = require('os');

// ── Internal helper: create a notification (idempotent by source+title within 1h) ──
async function pushNotification({ type, title, message, source, meta = {} }) {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        // Don't spam the same notification within 1 hour
        const existing = await SystemNotification.findOne({
            source,
            title,
            createdAt: { $gte: oneHourAgo },
        });
        if (!existing) {
            await SystemNotification.create({ type, title, message, source, meta });
        }
    } catch (_) {}
}
exports.pushNotification = pushNotification;

// ── Run system health check and push notifications for any issues found ────
async function runHealthCheck() {
    const issues = [];

    // 1. Blockchain status
    try {
        const registry = blockchainContract.getContract && blockchainContract.getContract('CertificateRegistry');
        if (!registry) {
            await pushNotification({
                type: 'error',
                title: 'Blockchain Offline',
                message: 'CertificateRegistry smart contract is unavailable. On-chain operations (certificate registration, ZK proof verification) are disabled.',
                source: 'blockchain',
            });
            issues.push('blockchain');
        } else {
            // Try to call a read method
            try {
                if (registry.runner?.provider) {
                    await registry.runner.provider.getBlockNumber();
                }
            } catch (e) {
                await pushNotification({
                    type: 'error',
                    title: 'Blockchain RPC Unreachable',
                    message: `Cannot reach Ganache / RPC node. Error: ${e.message}. Certificates cannot be anchored until the node is restored.`,
                    source: 'blockchain',
                    meta: { error: e.message },
                });
                issues.push('blockchain_rpc');
            }
        }
    } catch (e) {
        await pushNotification({
            type: 'error',
            title: 'Blockchain Module Error',
            message: `blockchain.js threw an exception: ${e.message}`,
            source: 'blockchain',
        });
    }

    // 2. Redis status — infer from a global flag set by the cache middleware
    const redisDown = global.__REDIS_DOWN__;
    if (redisDown) {
        await pushNotification({
            type: 'warning',
            title: 'Redis Cache Unavailable',
            message: 'Redis is not running (ECONNREFUSED on 127.0.0.1:6379). API response caching is disabled. Performance may be degraded under high load.',
            source: 'redis',
        });
        issues.push('redis');
    }

    // 3. Unanchored audit logs
    try {
        const unanchored = await AuditLog.countDocuments({ isAnchored: false, blockchainAnchored: false });
        if (unanchored > 50) {
            await pushNotification({
                type: 'warning',
                title: `${unanchored} Audit Logs Unanchored`,
                message: `There are ${unanchored} audit log entries not yet anchored to the blockchain. Use Admin → Anchor Logs to submit a batch hash.`,
                source: 'audit',
                meta: { count: unanchored },
            });
            issues.push('unanchored_logs');
        }
    } catch (_) {}

    // 4. Quarantined log entries (canary scanner)
    try {
        const quarantined = await AuditLog.countDocuments({ quarantined: true });
        if (quarantined > 0) {
            await pushNotification({
                type: 'error',
                title: `${quarantined} Audit Entries Quarantined`,
                message: `The canary scanner has quarantined ${quarantined} audit log entries due to suspected tampering or anomalous activity. Review them immediately in Audit Logs.`,
                source: 'canary',
                meta: { count: quarantined },
            });
            issues.push('quarantined');
        }
    } catch (_) {}

    // 5. High memory usage
    try {
        const total = os.totalmem();
        const free  = os.freemem();
        const usage = ((total - free) / total) * 100;
        if (usage > 90) {
            await pushNotification({
                type: 'error',
                title: 'Critical Memory Usage',
                message: `Server memory is at ${usage.toFixed(1)}%. Performance may be severely degraded. Consider restarting background workers or scaling up RAM.`,
                source: 'system',
                meta: { usagePercent: usage.toFixed(2) },
            });
            issues.push('high_memory');
        } else if (usage > 75) {
            await pushNotification({
                type: 'warning',
                title: 'High Memory Usage',
                message: `Server memory is at ${usage.toFixed(1)}%. Monitor closely. If usage reaches 90% the server may become unstable.`,
                source: 'system',
                meta: { usagePercent: usage.toFixed(2) },
            });
        }
    } catch (_) {}

    // 6. System error actions in recent audit logs
    try {
        const errorLogs = await AuditLog.find({
            action: /error|fail|crash/i,
            timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        }).limit(5).lean();

        if (errorLogs.length > 0) {
            await pushNotification({
                type: 'error',
                title: `${errorLogs.length} System Error(s) in Last Hour`,
                message: `Recent audit log entries indicate system errors: ${errorLogs.map(l => l.action).join(', ')}. Check the Audit Logs page for full details.`,
                source: 'api',
                meta: { actions: errorLogs.map(l => l.action) },
            });
        }
    } catch (_) {}

    return issues;
}
exports.runHealthCheck = runHealthCheck;

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/notifications
// ═══════════════════════════════════════════════════════════════════════════
exports.getNotifications = async (req, res, next) => {
    try {
        // Run health check first to push any new issues
        await runHealthCheck();

        const notifications = await SystemNotification.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const unreadCount = await SystemNotification.countDocuments({ read: false });

        return res.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/notifications/:id
// ═══════════════════════════════════════════════════════════════════════════
exports.markRead = async (req, res, next) => {
    try {
        await SystemNotification.findByIdAndUpdate(req.params.id, { read: true });
        return res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/notifications/read-all
// ═══════════════════════════════════════════════════════════════════════════
exports.markAllRead = async (req, res, next) => {
    try {
        await SystemNotification.updateMany({ read: false }, { $set: { read: true } });
        return res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};
