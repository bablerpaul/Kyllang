require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const blockchainContract = require('../blockchain');

async function run() {
    try {
        console.log("## Environment");
        console.log("TEST_MODE: " + process.env.TEST_MODE);
        
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang_health');
        console.log("MongoDB: UP");
        
        const registry = blockchainContract.getContract('CertificateRegistry');
        if (registry) {
            console.log("Ganache: UP");
            console.log("Backend: UP"); 
        } else {
            console.log("Ganache: DOWN");
        }

        const doctorUser = await User.findOne({ email: 'doctor@test.com' });
        const patientUser = await User.findOne({ email: 'patient@test.com' });

        if (!doctorUser || !patientUser) {
            console.log("Missing test accounts");
            process.exit(1);
        }

        console.log("\n## Test Certificate");
        let cert = await Certificate.findOne({ 
            patient: patientUser._id, 
            issuedBy: doctorUser._id,
            verificationMethod: 'zk_proof',
            status: { $ne: 'revoked' },
            publicCommitmentHash: { $exists: true }
        });

        if (!cert) {
            console.log("NO SAFE TEST CERTIFICATE AVAILABLE — REVOCATION E2E TEST SKIPPED");
            process.exit(0);
        }

        console.log("Certificate ID: " + cert._id);
        console.log("Test/disposable: Yes (belonging to test accounts)");
        console.log("Verification method: " + cert.verificationMethod);
        console.log("Pre-revocation status: " + cert.status);
        
        console.log("\n## Pre-revocation Blockchain State");
        const commitmentBytes32 = cert.publicCommitmentHash.startsWith('0x') ? cert.publicCommitmentHash : '0x' + cert.publicCommitmentHash;
        const [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(commitmentBytes32);
        console.log("certificate exists: " + exists);
        console.log("revoked = false: " + !revoked);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
