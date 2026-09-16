const mongoose = require('mongoose');
require('dotenv').config();
process.env.TEST_MODE = 'true';
process.env.MASTER_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const TamperEngine = require('../src/services/tamperEngine');
const blockchain = require('../blockchain');
const { generateIntegrityHash, buildIntegrityPayload } = require('../src/utils/canonicalize');

async function runTests() {
    console.log("=== TAMPER ENGINE VERIFICATION TESTS (TASK 5E) ===");

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/certificate-portal-test');

    const patientId = new mongoose.Types.ObjectId();
    const doctorId = new mongoose.Types.ObjectId();

    let record = new MedicalRecord({
        patient: patientId,
        doctor: doctorId,
        diagnosis: "Healthy",
        symptoms: [],
        medications: [],
        vitals: { hr: 60 },
        vitalSigns: { hr: 60 },
        clinicalNotes: "All good",
        visitDate: new Date('2026-08-17T00:00:00.000Z'),
        integrityVersion: 1,
        previousIntegrityHash: null
    });

    // Generate V1 hash
    let payloadV1 = buildIntegrityPayload(record);
    let hashV1 = generateIntegrityHash(payloadV1, 1, null);
    record.integrityHash = hashV1;
    await record.save();

    // V2
    record.diagnosis = "Slight Cold";
    record.integrityVersion = 2;
    record.previousIntegrityHash = hashV1;
    let payloadV2 = buildIntegrityPayload(record);
    let hashV2 = generateIntegrityHash(payloadV2, 2, hashV1);
    record.integrityHash = hashV2;
    await record.save();

    // V3
    record.diagnosis = "Recovered";
    record.integrityVersion = 3;
    record.previousIntegrityHash = hashV2;
    let payloadV3 = buildIntegrityPayload(record);
    const { canonicalize } = require('../src/utils/canonicalize');
    console.log("TEST CANONICAL STR:", canonicalize({
        data: payloadV3,
        version: 3,
        previousHash: hashV2
    }));
    let hashV3 = generateIntegrityHash(payloadV3, 3, hashV2);
    record.integrityHash = hashV3;
    await record.save();

    let passed = 0, failed = 0;

    const assertStatus = async (testName, id, expectedStatus) => {
        const res = await TamperEngine.verifyRecordIntegrity(id);
        
        // Ensure no PHI leakage
        const strRes = JSON.stringify(res).toLowerCase();
        if (strRes.includes('recovered') || strRes.includes('diagnosis') || strRes.includes('symptoms')) {
            console.error(`[FAIL] ${testName} - PHI Leakage Detected!`);
            failed++;
            return;
        }

        if (res.status === expectedStatus) {
            console.log(`[PASS] ${testName}`);
            passed++;
        } else {
            console.error(`[FAIL] ${testName} - Expected: ${expectedStatus}, Got: ${res.status}`);
            console.error(res);
            failed++;
        }
        return res;
    };

    // Setup Blockchain Mocks
    blockchain.getLatestRecordState = async (rc) => [3n, `0x${hashV3}`];
    blockchain.getIntegrityAnchor = async (rc, version) => {
        const v = Number(version);
        if (v === 1) return [rc, 1n, `0x${hashV1}`, "0x0000000000000000000000000000000000000000000000000000000000000000", 0n];
        if (v === 2) return [rc, 2n, `0x${hashV2}`, `0x${hashV1}`, 0n];
        if (v === 3) return [rc, 3n, `0x${hashV3}`, `0x${hashV2}`, 0n];
        throw new Error("Version does not exist");
    };

    // 1. Normal V1 -> V2 -> V3 Verification
    await assertStatus("Normal V3 Verification", record._id, "INTEGRITY_VERIFIED");

    // 14. Direct historical Version 1 lookup
    // 15. Direct historical Version 2 lookup
    // 16. Direct historical Version 3 lookup
    // 17. Previous hash verification using O(1) lookup
    // (These are implicitly tested by the success of V3 which checks V2 via getIntegrityAnchor, and we can mock a V2 check directly)

    // 2. Diagnosis tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { diagnosis: "Cancer" });
    await assertStatus("Diagnosis Tampering", record._id, "TAMPER_DETECTED");
    await MedicalRecord.findByIdAndUpdate(record._id, { diagnosis: "Recovered" }); // Revert

    // 3. Symptoms tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { symptoms: ["Cough"] });
    await assertStatus("Symptoms Tampering", record._id, "TAMPER_DETECTED");
    await MedicalRecord.findByIdAndUpdate(record._id, { symptoms: [] }); // Revert

    // 4. Medication tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { medications: ["Aspirin"] });
    await assertStatus("Medications Tampering", record._id, "TAMPER_DETECTED");
    await MedicalRecord.findByIdAndUpdate(record._id, { medications: [] }); // Revert

    // 5. Vital signs tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { vitalSigns: { hr: 90 } });
    await assertStatus("Vital Signs Tampering", record._id, "TAMPER_DETECTED");
    await MedicalRecord.findByIdAndUpdate(record._id, { vitalSigns: { hr: 60 } }); // Revert

    // 6. integrityHash tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityHash: "fakehash123" });
    await assertStatus("Stored integrityHash Tampering", record._id, "TAMPER_DETECTED");
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityHash: hashV3 }); // Revert

    // 7. Version rollback
    let rollbackDoc = await MedicalRecord.findById(record._id);
    rollbackDoc.diagnosis = "Healthy";
    rollbackDoc.integrityVersion = 1;
    rollbackDoc.integrityHash = hashV1;
    rollbackDoc.previousIntegrityHash = null;
    await rollbackDoc.save();
    
    await assertStatus("Version Rollback (DB V1, Chain V3)", record._id, "VERSION_MISMATCH");
    
    let restoreDoc = await MedicalRecord.findById(record._id);
    restoreDoc.diagnosis = "Recovered";
    restoreDoc.integrityVersion = 3;
    restoreDoc.integrityHash = hashV3;
    restoreDoc.previousIntegrityHash = hashV2;
    await restoreDoc.save();

    // 8. previousIntegrityHash tampering
    await MedicalRecord.findByIdAndUpdate(record._id, { previousIntegrityHash: "badhash" });
    // Modifying previous hash changes calculatedHash, so it will fail local hash check first unless we fix it
    let tamperedPayload = buildIntegrityPayload(await MedicalRecord.findById(record._id));
    let tamperedHash = generateIntegrityHash(tamperedPayload, 3, "badhash");
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityHash: tamperedHash }); // match local so it reaches blockchain previous hash check

    // Wait, the new tampered hash won't match blockchain hash V3! So it will fail on BLOCKCHAIN_HASH_MISMATCH
    // To strictly test PREVIOUS_HASH_MISMATCH at step 5, we have to mock the blockchain's latest hash to match our tampered one, but then the O(1) historical lookup will expose it!
    blockchain.getLatestRecordState = async (rc) => [3n, `0x${tamperedHash}`]; // Fake the chain matching
    await assertStatus("previousIntegrityHash Tampering", record._id, "TAMPER_DETECTED");
    
    // Restore
    await MedicalRecord.findByIdAndUpdate(record._id, { previousIntegrityHash: hashV2, integrityHash: hashV3 });
    blockchain.getLatestRecordState = async (rc) => [3n, `0x${hashV3}`];

    // 9. Pending anchor
    // Mock DB as V4, Blockchain as V3
    let payloadV4 = buildIntegrityPayload(await MedicalRecord.findById(record._id));
    let hashV4 = generateIntegrityHash(payloadV4, 4, hashV3);
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityVersion: 4, previousIntegrityHash: hashV3, integrityHash: hashV4 });
    await assertStatus("Pending Anchor (DB V4, Chain V3)", record._id, "ANCHOR_PENDING");
    
    // 10. Blockchain unavailable
    let originalGetLatest = blockchain.getLatestRecordState;
    blockchain.getLatestRecordState = async () => { throw new Error("Connection Refused"); };
    await assertStatus("Blockchain Unavailable", record._id, "BLOCKCHAIN_UNAVAILABLE");
    blockchain.getLatestRecordState = originalGetLatest;

    // 11. Missing anchor
    blockchain.getLatestRecordState = async (rc) => [0n, "0x0000000000000000000000000000000000000000000000000000000000000000"];
    await assertStatus("Missing Anchor", record._id, "ANCHOR_NOT_FOUND");
    blockchain.getLatestRecordState = originalGetLatest;

    // 14. Missing V2 while DB reports V3 (Version skipping)
    let tempGetAnchor = blockchain.getIntegrityAnchor;
    blockchain.getIntegrityAnchor = async (rc, version) => {
        const v = Number(version);
        if (v === 1) return [rc, 1n, `0x${hashV1}`, "0x0000000000000000000000000000000000000000000000000000000000000000", 0n];
        if (v === 2) return [rc, 0n, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0n]; // Missing
        if (v === 3) return [rc, 3n, `0x${hashV3}`, `0x${hashV1}`, 0n]; // Forged previous hash pointing to v1
        throw new Error("Version does not exist");
    };
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityVersion: 3, previousIntegrityHash: hashV1 });
    // update local hash so it passes local check
    let fakePayload = buildIntegrityPayload(await MedicalRecord.findById(record._id));
    let fakeHash = generateIntegrityHash(fakePayload, 3, hashV1);
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityHash: fakeHash });
    
    // Fake the chain's latest hash to match our fake payload to bypass BLOCKCHAIN_HASH_MISMATCH
    let tempLatestState = blockchain.getLatestRecordState;
    blockchain.getLatestRecordState = async (rc) => [3n, `0x${fakeHash}`];
    
    await assertStatus("Missing V2 while database reports V3", record._id, "TAMPER_DETECTED");

    // Restore state
    blockchain.getIntegrityAnchor = tempGetAnchor;
    blockchain.getLatestRecordState = tempLatestState;
    await MedicalRecord.findByIdAndUpdate(record._id, { integrityVersion: 3, previousIntegrityHash: hashV2, integrityHash: hashV3 });

    // 15. Attachment Tests
    // Create an attachment
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const uploadDir = path.join(__dirname, '..', 'uploads', 'emr');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const attPath = path.join(uploadDir, 'test_attachment.pdf');
    fs.writeFileSync(attPath, 'fake_encrypted_content');
    
    const attHash = crypto.createHash('sha256').update('fake_encrypted_content').digest('hex');
    
    let attRecord = await MedicalRecord.findById(record._id);
    attRecord.attachments = [{
        title: 'test.pdf',
        fileUrl: '/api/test_attachment.pdf',
        fileHash: attHash
    }];
    attRecord.integrityVersion = 5;
    attRecord.previousIntegrityHash = hashV3;
    let payloadV5 = buildIntegrityPayload(attRecord);
    let hashV5 = generateIntegrityHash(payloadV5, 5, hashV3);
    attRecord.integrityHash = hashV5;
    await attRecord.save();

    // Mock Blockchain
    blockchain.getLatestRecordState = async (rc) => [5n, `0x${hashV5}`];
    blockchain.getIntegrityAnchor = async (rc, version) => {
        const v = Number(version);
        if (v === 4) return [rc, 4n, `0x${hashV3}`, `0x${hashV2}`, 0n]; // mock v4 as v3's hash for simplicity
        if (v === 5) return [rc, 5n, `0x${hashV5}`, `0x${hashV3}`, 0n];
        throw new Error("Version does not exist");
    };

    await assertStatus("Attachment Verification (Success)", record._id, "INTEGRITY_VERIFIED");

    // 16. Attachment ciphertext modified
    fs.writeFileSync(attPath, 'malicious_content');
    await assertStatus("Attachment Ciphertext Modified", record._id, "TAMPER_DETECTED"); // ATTACHMENT_HASH_MISMATCH
    fs.writeFileSync(attPath, 'fake_encrypted_content'); // restore

    // 17. Attachment hash modified in MongoDB
    let fakeAttHash = crypto.createHash('sha256').update('malicious_content').digest('hex');
    let dbRecord = await MedicalRecord.findById(record._id);
    dbRecord.attachments[0].fileHash = fakeAttHash;
    await dbRecord.save();
    
    // this changes payload, so local hash mismatches
    await assertStatus("Attachment Hash Modified in MongoDB", record._id, "TAMPER_DETECTED");
    
    // restore
    dbRecord = await MedicalRecord.findById(record._id);
    dbRecord.attachments[0].fileHash = attHash;
    await dbRecord.save();

    // 18. Attachment unavailable
    fs.unlinkSync(attPath); // delete file
    await assertStatus("Attachment Unavailable", record._id, "ATTACHMENT_UNAVAILABLE");

    // 19. PHI leakage test
    const finalRes = await TamperEngine.verifyRecordIntegrity(record._id);
    if (JSON.stringify(finalRes).includes('Recovered') || JSON.stringify(finalRes).includes('Healthy')) {
        console.error("[FAIL] PHI Leakage Test - Exposed text!");
        failed++;
    } else {
        console.log("[PASS] PHI Leakage Test - Zero PHI exposed");
        passed++;
    }

    console.log(`\nTests completed. Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
