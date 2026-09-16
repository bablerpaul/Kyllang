const mongoose = require('mongoose');
const mongoose_schema = require('mongoose');
require('dotenv').config();

// Inject dummy key if missing
if (!process.env.MASTER_ENCRYPTION_KEY) {
    process.env.MASTER_ENCRYPTION_KEY = process.env.MASTER_KEY || 'testkey1234567890123456789012345';
}

const MedicalRecord = require('../models/MedicalRecord');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

async function runTest() {
    console.log("--- TEST NEW RECORD ENCRYPTION ---");
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kyllang_test';
    await mongoose.connect(uri);

    // Create dummy patient and doctor
    const patientId = new mongoose.Types.ObjectId();
    const doctorId = new mongoose.Types.ObjectId();

    const plainTestData = {
        patient: patientId,
        doctor: doctorId,
        diagnosis: "Stage 2 Hypertension",
        symptoms: "Severe headache, dizziness",
        allergies: "Penicillin",
        medications: "Lisinopril 10mg",
        vitalSigns: "BP 160/100, HR 85",
        attachments: [
            {
                title: "Cardiology_Report_Q3.pdf",
                fileUrl: "https://secure-bucket.s3.amazonaws.com/Cardiology_Report_Q3.pdf",
                ipfsCid: "QmTestCid123"
            }
        ]
    };

    console.log("1. Creating MedicalRecord with plaintext PHI...");
    const record = new MedicalRecord(plainTestData);
    await record.save();
    console.log("-> Mongoose record saved successfully.");

    console.log("\n2. RAW DATABASE VERIFICATION (bypassing Mongoose getters)...");
    const rawDoc = await mongoose.connection.db.collection('medicalrecords').findOne({ _id: record._id });
    
    // Check fields
    const fieldsToCheck = ['diagnosis', 'symptoms', 'allergies', 'medications', 'vitalSigns'];
    
    let rawPassed = true;
    for (const field of fieldsToCheck) {
        if (!rawDoc[field] || typeof rawDoc[field] !== 'string' || !rawDoc[field].startsWith('S01T')) {
             // wait, the KMS format is base64. Let's decode and check MAGIC_BYTES instead of relying on starting string
        }
        
        const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(rawDoc[field]);
        if (isBase64) {
             const buf = Buffer.from(rawDoc[field], 'base64');
             if (buf.length >= 4 && buf.subarray(0,4).equals(Buffer.from('KMS\x01'))) {
                 console.log(`- RAW ${field} is KMS encrypted.`);
             } else {
                 console.log(`- RAW ${field} is base64 but missing KMS bytes.`);
                 rawPassed = false;
             }
        } else {
             console.log(`- RAW ${field} is NOT base64 ciphertext! It might be plaintext!`);
             rawPassed = false;
        }
    }

    if (rawDoc.attachments && rawDoc.attachments[0]) {
        const att = rawDoc.attachments[0];
        ['title', 'fileUrl'].forEach(prop => {
            const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(att[prop]);
            if (isBase64) {
                 const buf = Buffer.from(att[prop], 'base64');
                 if (buf.length >= 4 && buf.subarray(0,4).equals(Buffer.from('KMS\x01'))) {
                     console.log(`- RAW attachments[0].${prop} is KMS encrypted.`);
                 } else {
                     console.log(`- RAW attachments[0].${prop} is base64 but missing KMS bytes.`);
                     rawPassed = false;
                 }
            } else {
                 console.log(`- RAW attachments[0].${prop} is NOT base64 ciphertext!`);
                 rawPassed = false;
            }
        });
        
        console.log(`- RAW attachments[0].ipfsCid is plaintext: ${att.ipfsCid === "QmTestCid123"}`);
    }

    console.log(`\nRaw Verification Result: ${rawPassed ? 'PASS' : 'FAIL'}`);

    console.log("\n3. DECRYPTION VERIFICATION (using Mongoose getters)...");
    const fetchedRecord = await MedicalRecord.findById(record._id);
    
    let decryptPassed = true;
    for (const field of fieldsToCheck) {
        if (fetchedRecord[field] === plainTestData[field]) {
            console.log(`- DECRYPTED ${field} matches original plaintext.`);
        } else {
            console.log(`- DECRYPTED ${field} MISMATCH!`);
            decryptPassed = false;
        }
    }

    if (fetchedRecord.attachments[0].title === plainTestData.attachments[0].title) {
        console.log(`- DECRYPTED attachments[0].title matches original plaintext.`);
    } else {
        console.log(`- DECRYPTED attachments[0].title MISMATCH!`);
        decryptPassed = false;
    }

    if (fetchedRecord.attachments[0].fileUrl === plainTestData.attachments[0].fileUrl) {
        console.log(`- DECRYPTED attachments[0].fileUrl matches original plaintext.`);
    } else {
        console.log(`- DECRYPTED attachments[0].fileUrl MISMATCH!`);
        decryptPassed = false;
    }

    console.log(`\nDecryption Verification Result: ${decryptPassed ? 'PASS' : 'FAIL'}`);

    // Cleanup
    await MedicalRecord.deleteOne({ _id: record._id });
    await mongoose.disconnect();
}

runTest().catch(console.error);
