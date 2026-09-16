require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const blockchainContract = require('../blockchain');
const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function run() {
    console.log("Starting Step 40B Verification...\n");
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
        
        // 0. Ensure test accounts exist
        const pwHash = await bcrypt.hash('Password123!', 10);
        let docUser = await User.findOne({ email: 'testdoctor1@test.com' });
        if (!docUser) {
            docUser = await User.create({
                name: 'Test Doctor 1',
                email: 'testdoctor1@test.com',
                password: 'Password123!',
                role: 'doctor',
                accountStatus: 'active',
                walletAddress: '0x' + '2'.repeat(40),
            });
            await Doctor.create({
                userId: docUser._id,
                user: docUser._id,
                specialty: 'General Practice',
                licenseNumber: 'DOC123456'
            });
            console.log("Created testdoctor1@test.com");
        } else {
            await User.updateOne({ _id: docUser._id }, { password: pwHash });
            console.log("Reset testdoctor1@test.com password");
        }
        
        let patUser = await User.findOne({ email: 'testpatient1@test.com' });
        if (!patUser) {
            patUser = await User.create({
                name: 'Test Patient 1',
                email: 'testpatient1@test.com',
                password: 'Password123!',
                role: 'general_user', // role in backend is general_user usually
                accountStatus: 'active',
                walletAddress: '0x' + '3'.repeat(40),
            });
            console.log("Created testpatient1@test.com");
        } else {
            await User.updateOne({ _id: patUser._id }, { password: pwHash });
            console.log("Reset testpatient1@test.com password");
        }

        // Add doctor to blockchain registry just to be sure he can issue
        const registry = blockchainContract.getContract('CertificateRegistry');
        try {
            await registry.addIssuer(docUser.walletAddress);
        } catch (e) {
            // ignore if already added
        }
        
        const Consent = require('../models/Consent');
        const PatientModel = require('../models/Patient');
        let patProfile = await PatientModel.findOne({ user: patUser._id });
        if (!patProfile) {
            patProfile = await PatientModel.create({ user: patUser._id, name: patUser.name });
            console.log("Created Patient profile");
        }
        let consent = await Consent.findOne({ patient: patProfile._id, grantedTo: docUser._id });
        if (!consent) {
            await Consent.create({
                patient: patProfile._id,
                grantedTo: docUser._id,
                grantedToRole: 'doctor',
                status: 'active',
                grantedAt: new Date(),
                permissions: ['view_records', 'add_records', 'issue_certificates'],
                transactionHash: '0x' + '0'.repeat(64)
            });
            console.log("Granted consent to doctor");
        }
        
        // 1. Get tokens
        const doctorLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'testdoctor1@test.com',
            password: 'Password123!'
        });
        const doctorToken = doctorLogin.data.data.token;
        const doctorId = doctorLogin.data.data._id;
        
        const patientLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'testpatient1@test.com',
            password: 'Password123!'
        });
        const patientToken = patientLogin.data.data.token;
        const patientId = patientLogin.data.data._id;
        
        console.log("Logged in successfully. Used testdoctor1@test.com and testpatient1@test.com as test accounts.");
        
        // 2. Issue Certificate (PART 1 & 2)
        const validFrom = new Date();
        const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
        const dummyHash = ethers.hexlify(ethers.randomBytes(32));
        
        console.log("\n## Issuance");
        const issueRes = await axios.post(`${API_BASE}/certificates`, {
            patientId: patProfile._id,
            diagnosis: "Test Diagnosis",
            publicCommitmentHash: dummyHash,
            issuerAddress: docUser.walletAddress,
            remarks: "STEP40 REVOCATION TEST",
            validFrom: validFrom.toISOString(),
            validUntil: validUntil.toISOString()
        }, {
            headers: { Authorization: `Bearer ${doctorToken}` }
        });
        
        const certData = issueRes.data.data;
        console.log("Certificate ID:", certData._id);
        console.log("publicCommitmentHash:", certData.publicCommitmentHash);
        console.log("blockchainTxHash:", certData.blockchainTxHash);
        
        // 3. Pre-Revocation State (PART 3)
        let dbCert = await Certificate.findById(certData._id);
        console.log("\n## Pre-Revocation");
        console.log("MongoDB status:", dbCert.status);
        
        const commitmentBytes32 = dbCert.publicCommitmentHash.startsWith('0x') ? dbCert.publicCommitmentHash : '0x' + dbCert.publicCommitmentHash;
        let [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(commitmentBytes32);
        console.log("On-chain revoked:", revoked);
        
        // 4. Revocation (PART 4 & 5 & 6)
        console.log("\n## Revocation");
        const revokeRes = await axios.put(`${API_BASE}/certificates/${certData._id}/revoke`, {
            reason: "STEP40 REVOCATION TEST"
        }, {
            headers: { Authorization: `Bearer ${doctorToken}` }
        });
        
        console.log("Revoke API Status:", revokeRes.status);
        
        // 5. Verify On-Chain State
        [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(commitmentBytes32);
        console.log("\n## Real Blockchain");
        console.log("revoked:", revoked);
        
        // 6. Verify MongoDB (PART 7)
        dbCert = await Certificate.findById(certData._id);
        console.log("\n## MongoDB State");
        console.log("status:", dbCert.status);
        console.log("revokedAt:", dbCert.revokedAt);
        console.log("revokeReason:", dbCert.revokeReason);
        
        // 7. Audit Log (PART 8)
        const logs = await AuditLog.find({ action: 'REVOKE_CERTIFICATE' }).sort({ createdAt: -1 }).limit(1);
        console.log("\n## AuditLog");
        if (logs.length > 0) {
            console.log("Audit log found:", logs[0].action, "for cert", logs[0].certificateId);
        } else {
            console.log("NOT IMPLEMENTED");
        }
        
        // 8. Already Revoked (PART 13)
        try {
            await axios.put(`${API_BASE}/certificates/${certData._id}/revoke`, { reason: "double revoke" }, {
                headers: { Authorization: `Bearer ${doctorToken}` }
            });
            console.log("Already Revoked check: FAILED (did not throw error)");
        } catch (e) {
            console.log("Already Revoked check Expected Error:", e.response?.status, e.response?.data?.message || "Operation failed");
        }
        
        // 9. Patient Revoke (PART 15)
        try {
            await axios.put(`${API_BASE}/certificates/${certData._id}/revoke`, { reason: "patient revoke" }, {
                headers: { Authorization: `Bearer ${patientToken}` }
            });
            console.log("Patient Revoke check: FAILED (did not throw error)");
        } catch (e) {
            console.log("Patient Revoke check Expected Error:", e.response?.status, e.response?.data?.message || e.message);
        }
        
        // 10. Unauthenticated (PART 16)
        try {
            await axios.put(`${API_BASE}/certificates/${certData._id}/revoke`, { reason: "unauth revoke" });
            console.log("Unauthenticated check: FAILED (did not throw error)");
        } catch (e) {
            console.log("Unauthenticated check Expected Error:", e.response?.status, e.response?.data?.message || e.message);
        }
        
        console.log("\n## UI Check Preparation");
        console.log("Please check UI with testpatient1@test.com / Password123! for cert ID", certData._id);

    } catch (e) {
        if (e.response) {
            console.error("API Error:", e.response.status, e.response.data);
        } else {
            console.error(e);
        }
    } finally {
        await mongoose.disconnect();
    }
}
run();
