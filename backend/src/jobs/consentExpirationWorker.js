const cron = require('node-cron');
const Consent = require('../../models/Consent');
const AuditLog = require('../../models/AuditLog');

const startConsentExpirationWorker = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // Find active consents that have expired
            const expiredConsents = await Consent.find({
                status: 'active',
                expiresAt: { $lte: now }
            });

            if (expiredConsents.length > 0) {
                console.log(`[ConsentExpirationWorker] Found ${expiredConsents.length} expired consents.`);
                
                for (const consent of expiredConsents) {
                    consent.status = 'expired';
                    await consent.save();

                    // Generate Audit Log
                    await AuditLog.create({
                        actor: consent.patient, // Attributing to patient as it's their record
                        action: 'EXPIRE_CONSENT',
                        details: {
                            consentId: consent._id,
                            grantedTo: consent.grantedTo,
                            scope: consent.scope,
                            purpose: consent.purpose,
                            note: 'Automatically expired by system'
                        }
                    });
                }
                console.log(`[ConsentExpirationWorker] Successfully updated ${expiredConsents.length} consents to expired.`);
            }
        } catch (error) {
            console.error('[ConsentExpirationWorker] Error processing expired consents:', error);
        }
    });
};

module.exports = { startConsentExpirationWorker };
