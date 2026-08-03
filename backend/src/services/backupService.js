const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const backupDir = path.join(__dirname, '../../../../backups');

/**
 * Creates a JSON backup of all registered Mongoose models.
 * @returns {Promise<string>} The path to the created backup directory.
 */
exports.createBackup = async () => {
    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const currentBackupDir = path.join(backupDir, timestamp);
        fs.mkdirSync(currentBackupDir, { recursive: true });

        const models = mongoose.modelNames();
        
        for (const modelName of models) {
            const Model = mongoose.model(modelName);
            // Fetch raw JSON objects
            const data = await Model.find({}).lean();
            
            if (data && data.length > 0) {
                const filePath = path.join(currentBackupDir, `${modelName}.json`);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            }
        }
        
        console.log(`[Backup Manager] Successfully backed up ${models.length} collections to ${currentBackupDir}`);
        return currentBackupDir;
    } catch (err) {
        console.error(`[Backup Manager] Backup failed:`, err);
        throw err;
    }
};

/**
 * Restores a backup from a specific folder name located in the backups directory.
 * @param {string} folderName - The exact name of the backup folder (e.g. "2026-08-03T10-00-00-000Z")
 * @returns {Promise<void>}
 */
exports.restoreBackup = async (folderName) => {
    try {
        const targetDir = path.join(backupDir, folderName);
        if (!fs.existsSync(targetDir)) {
            throw new Error(`Backup folder not found: ${targetDir}`);
        }

        const files = fs.readdirSync(targetDir);
        const models = mongoose.modelNames();
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            const modelName = file.replace('.json', '');
            if (!models.includes(modelName)) {
                console.warn(`[Backup Manager] Skipping restore for ${modelName} - Model not registered.`);
                continue;
            }

            const Model = mongoose.model(modelName);
            const filePath = path.join(targetDir, file);
            
            const rawData = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(rawData);

            // Clean the collection before restore
            await Model.deleteMany({});
            
            if (data.length > 0) {
                // Mongoose automatically casts strings back to ObjectIds and ISO dates to native Dates
                await Model.insertMany(data);
                console.log(`[Backup Manager] Restored ${data.length} records into ${modelName} collection.`);
            }
        }
        
        console.log(`[Backup Manager] Restore completed successfully from ${folderName}`);
    } catch (err) {
        console.error(`[Backup Manager] Restore failed:`, err);
        throw err;
    }
};
