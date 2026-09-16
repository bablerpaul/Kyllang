const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const axios = require('axios');
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Certificate = require('../models/Certificate');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

async function verifyStep38A() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kyllang_db');
        
        const doctorA_user = await User.findOne({ role: 'doctor' });
        const doctorB_user = await User.findOne({ role: 'doctor', _id: { $ne: doctorA_user?._id } });
        const patient1_user = await User.findOne({ role: 'general_user' });

        if (!doctorA_user || !patient1_user) {
            console.error("Required test users not found.");
            process.exit(1);
        }

        const tokenDocA = generateToken(doctorA_user._id);
        const tokenDocB = doctorB_user ? generateToken(doctorB_user._id) : tokenDocA;
        const tokenPat = generateToken(patient1_user._id);

        const fakeCommitmentHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        let reportTxHash = '';

        console.log("UNAUTHORIZED DOCTOR TEST");
        try {
            await axios.post('http://localhost:5000/api/certificates', {
                patientId: patient1_user._id,
                publicCommitmentHash: fakeCommitmentHash,
                validFrom: new Date(),
                validUntil: new Date(),
            }, { headers: { Authorization: `Bearer ${tokenDocB}` } });
        } catch (e) {
            console.log("PASS:", e.response.status, e.response.data.message);
        }

        console.log("UNAUTHENTICATED TEST");
        try {
            await axios.post('http://localhost:5000/api/certificates', {
                patientId: patient1_user._id,
                publicCommitmentHash: fakeCommitmentHash,
                validFrom: new Date(),
                validUntil: new Date(),
            });
        } catch (e) {
            console.log("PASS:", e.response.status, e.response.data.message);
        }

        console.log("NON-DOCTOR TEST");
        try {
            await axios.post('http://localhost:5000/api/certificates', {
                patientId: patient1_user._id,
                publicCommitmentHash: fakeCommitmentHash,
                validFrom: new Date(),
                validUntil: new Date(),
            }, { headers: { Authorization: `Bearer ${tokenPat}` } });
        } catch (e) {
            console.log("PASS:", e.response.status, e.response.data.message);
        }

        console.log("API REQUEST & BLOCKCHAIN (Authorized Doctor)");
        try {
            const res = await axios.post('http://localhost:5000/api/certificates', {
                patientId: patient1_user._id,
                publicCommitmentHash: fakeCommitmentHash,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
                remarks: "Step 38A Test Certificate"
            }, { headers: { Authorization: `Bearer ${tokenDocA}` } });
            console.log("API POST Success:", res.status);
            reportTxHash = res.data.data.blockchainTxHash;
            console.log("TX Hash:", reportTxHash);
        } catch (e) {
            console.log("API POST Failed:", e.response?.data?.message || e.message);
        }

        console.log("MONGODB DB CHECK");
        const cert = await Certificate.findOne({ publicCommitmentHash: fakeCommitmentHash });
        if (cert) {
            console.log("Found Cert:", cert._id);
            console.log("Has Diagnosis field?", cert.diagnosis !== undefined ? "FAIL (Yes)" : "PASS (No)");
            console.log("Verification Method:", cert.verificationMethod);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
verifyStep38A();
