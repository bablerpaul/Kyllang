const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

if (!process.env.MASTER_ENCRYPTION_KEY) {
    process.env.MASTER_ENCRYPTION_KEY = process.env.MASTER_KEY || 'testkey1234567890123456789012345';
}

const MedicalRecord = require('../models/MedicalRecord');
const kmsService = require('../src/services/kmsService');

const MAGIC_BYTES = Buffer.from('KMS\x01');

const TARGET_FIELDS = [
    'diagnosis',
    'symptoms',
    'allergies',
    'medications',
    'vitals',
    'vitalSigns',
    'clinicalNotes',
    'chiefComplaint',
    'treatmentPlan'
];

function classifyField(value) {
    if (value === null || value === undefined || value === '') return 'EMPTY';
    if (typeof value === 'object') return 'PLAINTEXT';
    if (typeof value !== 'string') return 'UNKNOWN';

    const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(value) && (value.length % 4 === 0);
    if (isBase64 && value.length > 0) {
        const buf = Buffer.from(value, 'base64');
        if (buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC_BYTES)) {
            return 'KMS_ENCRYPTED';
        }
        if (buf.length >= 16) {
            try {
                const iv = buf.subarray(0, 16);
                const ciphertext = buf.subarray(16);
                const key = kmsService.getKey('v1');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                JSON.parse(decrypted.toString('utf8'));
                return 'LEGACY_V1_ENCRYPTED';
            } catch (e) { }
        }
        return 'UNKNOWN';
    }
    return 'PLAINTEXT';
}

async function runMigration() {
    console.log("--- STARTING CONTROLLED LEGACY EMR MIGRATION ---");
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal';
    await mongoose.connect(uri);

    const stats = {
        fieldsMigrated: 0,
        fieldsSkipped: 0,
        fieldsFailed: 0,
        recordsModified: 0
    };

    const collection = mongoose.connection.db.collection('medicalrecords');
    const cursor = collection.find({});

    for await (const rawDoc of cursor) {
        let fieldsToMigrate = [];
        let docHasUnknown = false;
        
        // 1. Classify fields
        for (const field of TARGET_FIELDS) {
            const val = rawDoc[field];
            if (val === undefined) continue;
            
            const classification = classifyField(val);
            if (classification === 'UNKNOWN') {
                console.error(`- Record ${rawDoc._id} | Field ${field} | UNKNOWN classification | Error: Stopping`);
                process.exit(1);
            }
            if (classification === 'PLAINTEXT') {
                fieldsToMigrate.push(field);
            } else {
                stats.fieldsSkipped++;
            }
        }

        // Check attachments
        if (rawDoc.attachments && Array.isArray(rawDoc.attachments)) {
            rawDoc.attachments.forEach((att, idx) => {
                ['title', 'fileUrl'].forEach(prop => {
                    const val = att[prop];
                    if (val !== undefined) {
                        const classification = classifyField(val);
                        if (classification === 'UNKNOWN') {
                            console.error(`- Record ${rawDoc._id} | Field attachments[${idx}].${prop} | UNKNOWN classification | Error: Stopping`);
                            process.exit(1);
                        }
                        if (classification === 'PLAINTEXT') {
                            fieldsToMigrate.push(`attachments[${idx}].${prop}`);
                        } else {
                            stats.fieldsSkipped++;
                        }
                    }
                });
            });
        }

        if (fieldsToMigrate.length === 0) continue;

        // 2. Encrypt only confirmed plaintext fields
        const doc = await MedicalRecord.findById(rawDoc._id);
        const originalValues = {};

        fieldsToMigrate.forEach(f => {
            if (f.startsWith('attachments[')) {
                const parts = f.match(/attachments\[(\d+)\]\.(.*)/);
                const idx = parseInt(parts[1]);
                const prop = parts[2];
                originalValues[f] = doc.attachments[idx][prop];
                doc.attachments[idx][prop] = originalValues[f];
                doc.markModified(`attachments.${idx}.${prop}`);
            } else {
                originalValues[f] = doc[f];
                doc[f] = originalValues[f];
                doc.markModified(f);
            }
        });

        // 3. Save the record
        await doc.save();
        stats.recordsModified++;

        // 4. Immediately verify saved ciphertext
        const updatedRaw = await collection.findOne({ _id: rawDoc._id });
        
        // 5. Decrypt saved ciphertext
        const checkDoc = await MedicalRecord.findById(rawDoc._id);

        for (const f of fieldsToMigrate) {
            let rawVal, decVal, origVal;
            if (f.startsWith('attachments[')) {
                const parts = f.match(/attachments\[(\d+)\]\.(.*)/);
                const idx = parseInt(parts[1]);
                const prop = parts[2];
                rawVal = updatedRaw.attachments[idx][prop];
                decVal = checkDoc.attachments[idx][prop];
                origVal = originalValues[f];
            } else {
                rawVal = updatedRaw[f];
                decVal = checkDoc[f];
                origVal = originalValues[f];
            }

            const newClass = classifyField(rawVal);
            if (newClass !== 'KMS_ENCRYPTED') {
                console.error(`- Record ${rawDoc._id} | Field ${f} | KMS_ENCRYPTED | FAILED: Raw field is ${newClass}`);
                process.exit(1);
            }

            // 6. Verify decrypted value matches original
            if (JSON.stringify(decVal) !== JSON.stringify(origVal)) {
                console.error(`- Record ${rawDoc._id} | Field ${f} | KMS_ENCRYPTED | FAILED: Decrypted value mismatch! Expected "${JSON.stringify(origVal)}" got "${JSON.stringify(decVal)}"`);
                process.exit(1);
            }

            // 7. Mark successfully migrated
            console.log(`- Record ${rawDoc._id} | Field ${f} | PLAINTEXT -> KMS_ENCRYPTED | SUCCESS`);
            stats.fieldsMigrated++;
        }
    }

    console.log("\n--- MIGRATION STATS ---");
    console.log(`Fields Migrated: ${stats.fieldsMigrated}`);
    console.log(`Fields Skipped: ${stats.fieldsSkipped}`);
    console.log(`Fields Failed: ${stats.fieldsFailed}`);
    console.log(`Records Modified: ${stats.recordsModified}`);

    await mongoose.disconnect();
}

runMigration().catch((e) => {
    console.error("FATAL ERROR DURING MIGRATION:", e);
    process.exit(1);
});
