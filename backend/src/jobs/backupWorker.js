const { createBackup } = require('../services/backupService');

/**
 * Initializes the automated backup worker.
 * Runs every 24 hours to backup all MongoDB models.
 */
exports.startBackupWorker = () => {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    
    console.log('[Backup Worker] Initialized. Automated backups scheduled every 24 hours.');

    setInterval(async () => {
        try {
            console.log('[Backup Worker] Initiating scheduled automated backup...');
            await createBackup();
        } catch (err) {
            console.error('[Backup Worker] Scheduled backup encountered an error:', err);
        }
    }, TWENTY_FOUR_HOURS_MS);
};
