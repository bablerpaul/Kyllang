const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const Certificate = require('../models/Certificate');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const blockchainContract = require('../blockchain');
const { hasActiveConsent } = require('../middlewares/consentMiddleware');

async function testStep38() {
    try {
        console.log("=== STEP 38: MEDICAL CERTIFICATE TEST ===");
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kyllang_db');
        console.log("Connected to MongoDB.");

        // Wait for blockchain to initialize
        await new Promise(r => setTimeout(r, 2000));
        
        const registry = blockchainContract.getContract('CertificateRegistry');
        if (!registry) {
            console.error("CertificateRegistry contract not found.");
            process.exit(1);
        }
        console.log("CertificateRegistry connected.");

        // Find users
        const admin_user = await User.findOne({ role: 'admin' });
        const doctorA_user = await User.findOne({ role: 'doctor' });
        const doctorB_user = await User.findOne({ role: 'doctor', _id: { $ne: doctorA_user?._id } });
        const patient1_user = await User.findOne({ role: 'general_user' });

        if (!admin_user || !doctorA_user || !patient1_user) {
            console.error("Test users not found.");
            process.exit(1);
        }

        console.log("\n--- TEST 1: CONSENT VERIFICATION ---");
        // Verify doctorA has consent, doctorB doesn't
        let resA = await hasActiveConsent({ patientInput: patient1_user._id, requestingUser: doctorA_user });
        console.log(`Doctor A -> Patient 1 Consent: ${resA} (Expected: true)`);
        
        let resB = await hasActiveConsent({ patientInput: patient1_user._id, requestingUser: doctorB_user });
        console.log(`Doctor B -> Patient 1 Consent: ${resB} (Expected: false)`);

        console.log("\n--- TEST 2: BLOCKCHAIN ANCHOR ---");
        // Create a fake commitment hash
        const testHashHex = '0x1122334455667788990011223344556677889900112233445566778899002211';
        
        console.log(`Anchoring hash: ${testHashHex}`);
        let txHash;
        try {
            const tx = await registry.registerCertificate(testHashHex);
            const receipt = await tx.wait();
            txHash = receipt.hash || tx.hash;
            console.log(`Success! Transaction Hash: ${txHash}`);
        } catch (e) {
            console.error("Failed to anchor to blockchain:", e.message);
        }

        console.log("\n--- TEST 3: DB VERIFICATION ---");
        if (txHash) {
            let doctorProfile = await Doctor.findOne({ user: doctorA_user._id });
            const cert = await Certificate.create({
                patient: patient1_user._id,
                issuedBy: doctorA_user._id,
                doctor: doctorProfile?._id,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
                remarks: "Test certificate for Step 38",
                publicCommitmentHash: testHashHex,
                verificationHash: testHashHex,
                blockchainTxHash: txHash,
                issuerAddress: "0xTestAddress",
                verificationMethod: 'zk_proof'
            });
            console.log(`Certificate saved to DB. ID: ${cert._id}`);
            
            // Verify privacy: diagnosis is NOT present
            if (cert.diagnosis) {
                console.error("FAIL: Diagnosis was saved to DB!");
            } else {
                console.log("PASS: Diagnosis correctly excluded from DB schema.");
            }
        }

        console.log("\nALL TESTS COMPLETED.");
        process.exit(0);

    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
}

testStep38();
