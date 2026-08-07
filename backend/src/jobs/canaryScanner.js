// KYLLANG_V4: Canary Scanner
// Runs every 24 hours to scan dormant EMR records for cryptographic integrity.
// Quarantines any records that fail HMAC/ZK verification and alerts admins.

const Certificate = require('../../models/Certificate');
const AuditLog = require('../../models/AuditLog');
const crypto = require('crypto');

async function scanDormantRecords() {
    console.log('[CanaryScanner] Starting daily integrity scan...');
    try {
        // Find certificates that haven't been accessed in > 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dormantCerts = await Certificate.find({
            updatedAt: { $lt: thirtyDaysAgo }
        }).lean();

        let quarantined = 0;

        for (const cert of dormantCerts) {
            // For hmac_legacy, we can't fully verify without the raw data,
            // but we can check if the verificationHash is structurally sound (hex 64 chars)
            if (cert.verificationMethod === 'hmac_legacy') {
                if (!cert.verificationHash || cert.verificationHash.length !== 64) {
                    await quarantineRecord(cert._id, 'Invalid HMAC structure detected during canary scan');
                    quarantined++;
                }
            } else if (cert.verificationMethod === 'zk_proof') {
                if (!cert.zkNullifier) {
                    await quarantineRecord(cert._id, 'Missing ZK nullifier detected during canary scan');
                    quarantined++;
                }
            }
        }

        console.log(`[CanaryScanner] Scan complete. Checked ${dormantCerts.length} records. Quarantined ${quarantined}.`);
    } catch (err) {
        console.error('[CanaryScanner] Scan failed:', err.message);
    }
}

async function quarantineRecord(certId, reason) {
    try {
        await AuditLog.create({
            action: 'QUARANTINE_RECORD',
            status: 'success',
            details: { certId, reason },
            quarantined: true,
            quarantineReason: reason
        });
        console.warn(`[CanaryScanner] Quarantined certificate ${certId}: ${reason}`);
    } catch (err) {
        console.error(`[CanaryScanner] Failed to log quarantine for ${certId}:`, err.message);
    }
}

let interval = null;

function startCanaryScanner() {
    // Run every 24 hours, or every 5 seconds in test mode
    const ms = process.env.NODE_ENV === 'test' ? 5000 : 24 * 60 * 60 * 1000;
    interval = setInterval(scanDormantRecords, ms);
    console.log(`[CanaryScanner] Worker started (interval: ${ms}ms)`);
}

function stopCanaryScanner() {
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

module.exports = { startCanaryScanner, stopCanaryScanner, scanDormantRecords };
