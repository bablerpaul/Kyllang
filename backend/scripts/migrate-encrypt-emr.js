const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
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
    if (value === null || value === undefined || value === '') {
        return 'EMPTY';
    }

    if (typeof value === 'object') {
        // If it's a raw array or object in MongoDB, it's plaintext
        return 'PLAINTEXT';
    }

    if (typeof value !== 'string') {
        return 'UNKNOWN';
    }

    const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(value) && (value.length % 4 === 0);

    if (isBase64 && value.length > 0) {
        const buf = Buffer.from(value, 'base64');
        
        // Check KMS
        if (buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC_BYTES)) {
            return 'KMS_ENCRYPTED';
        }

        // Check Legacy V1
        if (buf.length >= 16) {
            try {
                const iv = buf.subarray(0, 16);
                const ciphertext = buf.subarray(16);
                const key = kmsService.getKey('v1');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                
                // Must be valid JSON to be considered successfully decrypted V1 field
                JSON.parse(decrypted.toString('utf8'));
                return 'LEGACY_V1_ENCRYPTED';
            } catch (e) {
                // Failed decryption. Fall through.
            }
        }

        // It is base64 but neither KMS nor V1.
        // It could be a plaintext string that just happens to be valid base64, or corrupted ciphertext.
        // Let's check if it contains spaces or common punctuation which aren't base64 chars.
        // Actually, if it's strictly base64, it might be an unknown format.
        return 'UNKNOWN';
    }

    // Not base64, definitely plaintext
    return 'PLAINTEXT';
}

async function runTests() {
    console.log("--- RUNNING ISOLATED CLASSIFICATION TESTS ---");
    
    // A. Plaintext
    console.log("Test A (Plaintext):", classifyField("Patient has a severe headache.") === 'PLAINTEXT' ? 'PASS' : 'FAIL');
    
    // B. KMS Encrypted
    const testVal = JSON.stringify("test data");
    const testBuf = Buffer.from(testVal, 'utf8');
    const iv = crypto.randomBytes(16);
    const keyId = kmsService.getActiveKeyId();
    const key = kmsService.getKey(keyId);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encBuf = Buffer.concat([cipher.update(testBuf), cipher.final()]);
    const versionBuf = Buffer.from(keyId);
    const versionLen = Buffer.from([versionBuf.length]);
    const kmsPayload = Buffer.concat([MAGIC_BYTES, versionLen, versionBuf, iv, encBuf]).toString('base64');
    console.log("Test B (KMS_ENCRYPTED):", classifyField(kmsPayload) === 'KMS_ENCRYPTED' ? 'PASS' : 'FAIL');

    // C. Legacy V1 Encrypted
    const v1Key = kmsService.getKey('v1');
    const v1Cipher = crypto.createCipheriv('aes-256-cbc', v1Key, iv);
    const v1EncBuf = Buffer.concat([v1Cipher.update(testBuf), v1Cipher.final()]);
    const v1Payload = Buffer.concat([iv, v1EncBuf]).toString('base64');
    console.log("Test C (LEGACY_V1_ENCRYPTED):", classifyField(v1Payload) === 'LEGACY_V1_ENCRYPTED' ? 'PASS' : 'FAIL');

    // D. Malformed/Corrupted field (Base64 but invalid decryption)
    const corruptedPayload = Buffer.concat([iv, Buffer.from("randomgarbage")]).toString('base64');
    console.log("Test D (UNKNOWN - Corrupted):", classifyField(corruptedPayload) === 'UNKNOWN' ? 'PASS' : 'FAIL');

    // E. Unknown field
    const unknownPayload = Buffer.from("some completely unknown binary format that is long enough to be base64").toString('base64');
    console.log("Test E (UNKNOWN):", classifyField(unknownPayload) === 'UNKNOWN' ? 'PASS' : 'FAIL');
    
    console.log("---------------------------------------------\n");
}

async function runDryRun() {
    console.log("--- STARTING DRY-RUN MIGRATION ---");
    const isDryRun = process.argv.includes('--dry-run');
    if (!isDryRun) {
        console.error("CRITICAL: Script must be run with --dry-run flag for safety.");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal');

    console.log("Connected to MongoDB. Streaming records...");

    const stats = {
        totalRecords: 0,
        kmsEncrypted: 0,
        legacyV1Encrypted: 0,
        plaintext: 0,
        unknown: 0,
        alreadyCompliant: 0,
        errors: 0
    };

    const unknownAndErrors = [];
    const cursor = MedicalRecord.find({}).lean().cursor();

    for await (const doc of cursor) {
        stats.totalRecords++;
        let docHasPlaintext = false;
        let docHasUnknown = false;
        let docHasLegacy = false;
        
        // Check core fields
        for (const field of TARGET_FIELDS) {
            const val = doc[field];
            if (val === undefined) continue;
            
            try {
                const classification = classifyField(val);
                if (classification === 'PLAINTEXT') docHasPlaintext = true;
                if (classification === 'LEGACY_V1_ENCRYPTED') docHasLegacy = true;
                if (classification === 'UNKNOWN') {
                    docHasUnknown = true;
                    unknownAndErrors.push({ id: doc._id.toString(), field, reason: 'UNKNOWN classification' });
                }
            } catch (e) {
                stats.errors++;
                unknownAndErrors.push({ id: doc._id.toString(), field, reason: `Error during classification: ${e.message}` });
            }
        }

        // Check attachments
        if (doc.attachments && Array.isArray(doc.attachments)) {
            doc.attachments.forEach((att, index) => {
                if (att.title) {
                    const classTitle = classifyField(att.title);
                    if (classTitle === 'PLAINTEXT') docHasPlaintext = true;
                    if (classTitle === 'UNKNOWN') {
                        docHasUnknown = true;
                        unknownAndErrors.push({ id: doc._id.toString(), field: `attachments[${index}].title`, reason: 'UNKNOWN classification' });
                    }
                }
                if (att.fileUrl) {
                    const classUrl = classifyField(att.fileUrl);
                    if (classUrl === 'PLAINTEXT') docHasPlaintext = true;
                    if (classUrl === 'UNKNOWN') {
                        docHasUnknown = true;
                        unknownAndErrors.push({ id: doc._id.toString(), field: `attachments[${index}].fileUrl`, reason: 'UNKNOWN classification' });
                    }
                }
            });
        }

        if (docHasUnknown) {
            stats.unknown++;
        } else if (docHasPlaintext) {
            stats.plaintext++;
        } else if (docHasLegacy) {
            stats.legacyV1Encrypted++;
        } else {
            stats.kmsEncrypted++;
            stats.alreadyCompliant++;
        }
    }

    console.log("\n--- DRY-RUN MIGRATION REPORT ---");
    console.log(`Total records: ${stats.totalRecords}`);
    console.log(`KMS encrypted (Fully Compliant): ${stats.kmsEncrypted}`);
    console.log(`Legacy V1 encrypted: ${stats.legacyV1Encrypted}`);
    console.log(`Plaintext: ${stats.plaintext}`);
    console.log(`Unknown: ${stats.unknown}`);
    console.log(`Already compliant: ${stats.alreadyCompliant}`);
    console.log(`Errors: ${stats.errors}`);

    if (unknownAndErrors.length > 0) {
        console.log("\nUNKNOWN or ERROR records:");
        unknownAndErrors.forEach(ue => {
            console.log(`- Record ID: ${ue.id} | Field: ${ue.field} | Reason: ${ue.reason}`);
        });
    }

    console.log("\nSafety Confirmations:");
    console.log("- Dry-run completed.");
    console.log("- Zero database writes occurred.");
    console.log("- No PHI was printed to console.");

    await mongoose.disconnect();
}

async function main() {
    try {
        await runTests();
        await runDryRun();
    } catch (e) {
        console.error("Fatal Error:", e);
        process.exit(1);
    }
}

main();
