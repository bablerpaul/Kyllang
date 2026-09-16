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
    'treatmentPlan',
    'attachments.title',
    'attachments.fileUrl'
];

function classifyField(value) {
    if (value === null || value === undefined || value === '') {
        return 'EMPTY';
    }

    if (typeof value === 'object') {
        return 'PLAINTEXT';
    }

    if (typeof value !== 'string') {
        return 'UNKNOWN';
    }

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

async function runAudit() {
    console.log("--- STARTING REAL DATABASE READ-ONLY AUDIT ---");

    if (!process.env.MASTER_ENCRYPTION_KEY) {
        process.env.MASTER_ENCRYPTION_KEY = process.env.MASTER_KEY || 'testkey1234567890123456789012345';
    }

    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal';
    await mongoose.connect(uri);

    console.log("MongoDB connection successful");
    console.log(`Database name: certificate-portal`);
    console.log(`MedicalRecord collection name: medicalrecords`);
    
    const count = await MedicalRecord.countDocuments();
    console.log(`Total MedicalRecord document count: ${count}`);

    const matrix = {};
    TARGET_FIELDS.forEach(f => {
        matrix[f] = { KMS_ENCRYPTED: 0, LEGACY_V1_ENCRYPTED: 0, PLAINTEXT: 0, UNKNOWN: 0, EMPTY: 0 };
    });

    let totalScanned = 0;
    let totalFieldsScanned = 0;
    let totalPlaintextPHI = 0;
    let totalEncrypted = 0;
    let totalUnknown = 0;
    let totalErrors = 0;
    let patientSaltExists = 0;
    let patientSaltPopulated = 0;

    const unknownLogs = [];

    const cursor = MedicalRecord.find({}).lean().cursor();

    for await (const doc of cursor) {
        totalScanned++;
        
        if ('patientSalt' in doc) {
            patientSaltExists++;
            if (doc.patientSalt !== null && doc.patientSalt !== '') {
                patientSaltPopulated++;
            }
        }

        TARGET_FIELDS.forEach(field => {
            let val;
            if (field.startsWith('attachments.')) {
                const prop = field.split('.')[1];
                if (doc.attachments && Array.isArray(doc.attachments)) {
                    doc.attachments.forEach((att, idx) => {
                        totalFieldsScanned++;
                        const c = classifyField(att[prop]);
                        matrix[field][c]++;
                        if (c === 'PLAINTEXT') totalPlaintextPHI++;
                        if (c === 'KMS_ENCRYPTED' || c === 'LEGACY_V1_ENCRYPTED') totalEncrypted++;
                        if (c === 'UNKNOWN') {
                            totalUnknown++;
                            unknownLogs.push({ id: doc._id.toString(), field: `attachments[${idx}].${prop}`, reason: 'Ambiguous base64' });
                        }
                    });
                }
            } else {
                totalFieldsScanned++;
                val = doc[field];
                const c = classifyField(val);
                matrix[field][c]++;
                if (c === 'PLAINTEXT') totalPlaintextPHI++;
                if (c === 'KMS_ENCRYPTED' || c === 'LEGACY_V1_ENCRYPTED') totalEncrypted++;
                if (c === 'UNKNOWN') {
                    totalUnknown++;
                    unknownLogs.push({ id: doc._id.toString(), field, reason: 'Ambiguous base64 or unsupported type' });
                }
            }
        });
    }

    console.log("\n| Field | KMS | V1 | Plaintext | Unknown | Empty |");
    console.log("|------|-----|-----|-----------|---------|-------|");
    TARGET_FIELDS.forEach(f => {
        const row = matrix[f];
        console.log(`| ${f} | ${row.KMS_ENCRYPTED} | ${row.LEGACY_V1_ENCRYPTED} | ${row.PLAINTEXT} | ${row.UNKNOWN} | ${row.EMPTY} |`);
    });

    console.log(`\n- Total records scanned: ${totalScanned}`);
    console.log(`- Total fields scanned: ${totalFieldsScanned}`);
    console.log(`- Total plaintext PHI fields: ${totalPlaintextPHI}`);
    console.log(`- Total encrypted fields: ${totalEncrypted}`);
    console.log(`- Total unknown fields: ${totalUnknown}`);
    console.log(`- Total errors: ${totalErrors}`);
    
    console.log(`\n- patientSalt exists in records: ${patientSaltExists}`);
    console.log(`- patientSalt is populated: ${patientSaltPopulated}`);

    if (unknownLogs.length > 0) {
        console.log("\nUNKNOWN VALUES:");
        unknownLogs.forEach(u => console.log(`- Record ID: ${u.id} | Field: ${u.field} | Reason: ${u.reason}`));
    }

    await mongoose.disconnect();
}

runAudit().catch(console.error);
