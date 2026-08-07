const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const InsuranceClaim = require('../models/InsuranceClaim');
const jwt = require('jsonwebtoken');

// Load environment and app
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('../index');

const PORT = 5098;
const BASE_URL = `http://localhost:${PORT}/api`;

let server;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1d' });
};

async function runTests() {
    console.log('--- Starting Insurance Storage Integration Tests ---');
    try {
        if (mongoose.connection.readyState !== 1) {
            console.log('Waiting for MongoDB connection...');
            await new Promise(resolve => mongoose.connection.once('open', resolve));
        }
        console.log('Connected to MongoDB');

        // Clean up before test
        await User.deleteMany({ email: { $in: ['admin_ins2@example.com', 'patient_ins2@example.com'] } });
        await InsuranceClaim.deleteMany({ provider: 'HealthCare Plus 2' });

        // Create mock users
        const adminUser = await User.create({
            name: 'Insurance Admin 2',
            email: 'admin_ins2@example.com',
            password: 'password123',
            role: 'hospital_admin'
        });

        const patientUser = await User.create({
            name: 'Patient John 2',
            email: 'patient_ins2@example.com',
            password: 'password123',
            role: 'general_user'
        });

        const patient = await Patient.create({ user: patientUser._id });

        const adminToken = generateToken(adminUser._id);
        const patientToken = generateToken(patientUser._id);

        // Create mock claim directly in DB for simplicity
        const claim = await InsuranceClaim.create({
            patient: patient._id,
            user: patientUser._id,
            provider: 'HealthCare Plus 2',
            policyNumber: 'HC-123456',
            claimAmount: 5000,
            status: 'submitted'
        });
        
        const claimId = claim._id;
        console.log(`Created Claim: ${claimId}`);

        // Upload Document
        console.log('\n[TEST 1] Upload Claim Document');
        
        const dummyContent = 'This is a test claim document PDF content.';
        const blob = new Blob([dummyContent], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, 'claim-doc.pdf');
        
        const uploadRes = await fetch(`${BASE_URL}/insurance/claims/${claimId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            },
            body: formData
        });
        
        const uploadData = await uploadRes.json();

        if (uploadRes.status === 201) {
            console.log(`✅ Upload Success! DocID: ${uploadData.document._id}`);
        } else {
            console.error(`❌ Upload Failed:`, uploadData);
            process.exit(1);
        }

        const docId = uploadData.document._id;

        // Get Documents
        console.log('\n[TEST 2] List Claim Documents');
        const listRes = await fetch(`${BASE_URL}/insurance/claims/${claimId}/documents`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const listData = await listRes.json();
        
        if (listRes.status === 200 && listData.length >= 1) {
            console.log('✅ List Documents Success!');
        } else {
            console.error('❌ List Documents Failed:', listData);
            process.exit(1);
        }

        // Download Document
        console.log('\n[TEST 3] Download Claim Document');
        const dlRes = await fetch(`${BASE_URL}/insurance/claims/${claimId}/documents/${docId}/download`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const dlText = await dlRes.text();
        
        if (dlRes.status === 200 && dlText === dummyContent) {
            console.log('✅ Download Success! Content verified.');
        } else {
            console.error('❌ Download Failed:', dlRes.status, dlText);
            process.exit(1);
        }

        console.log('\n🎉 ALL TESTS PASSED 🎉');

        // Cleanup
        await InsuranceClaim.deleteMany({ provider: 'HealthCare Plus 2' });
        await User.deleteMany({ email: { $in: ['admin_ins2@example.com', 'patient_ins2@example.com'] } });
        await Patient.deleteMany({ user: patientUser._id });

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        if (server) server.close();
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Start Server & Run
server = app.listen(PORT, () => {
    console.log(`Test server listening on port ${PORT}`);
    runTests();
});
