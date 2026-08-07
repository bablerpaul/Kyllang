const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Consent = require('../models/Consent');
const jwt = require('jsonwebtoken');

// Load environment and app
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('../index');

const PORT = 5099;
const BASE_URL = `http://localhost:${PORT}/api`;

let server;

// Helper to generate a dummy token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1d' });
};

async function setupTestData() {
    console.log('--- Setting up test data ---');
    // Clear test data if exists
    await User.deleteMany({ email: { $in: ['test_patient@example.com', 'test_doctor@example.com'] } });
    
    const patientUser = await User.create({
        name: 'Test Patient',
        email: 'test_patient@example.com',
        password: 'password123', // usually hashed, but bypassing since we mock token
        role: 'general_user'
    });

    const doctorUser = await User.create({
        name: 'Test Doctor',
        email: 'test_doctor@example.com',
        password: 'password123',
        role: 'doctor'
    });

    const patient = await Patient.create({
        user: patientUser._id,
        name: 'Test Patient',
        email: 'test_patient@example.com',
        dob: new Date('1990-01-01'),
        gender: 'Male',
        assignedDoctors: [doctorUser._id] // Assinging doctor for consent
    });

    console.log('Test users and patient created.');
    
    return { 
        patientUser, doctorUser, patient,
        patientToken: generateToken(patientUser._id),
        doctorToken: generateToken(doctorUser._id)
    };
}

async function runTests() {
    try {
        console.log('--- Starting Integration Tests ---');
        
        // Ensure MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            console.log('Waiting for MongoDB connection...');
            await new Promise(resolve => mongoose.connection.once('open', resolve));
        }

        const data = await setupTestData();

        // 1. Upload Document as Doctor
        console.log('\n[TEST 1] Doctor Uploads Secure Document');
        
        // Create dummy file buffer
        const dummyContent = 'Hello Secure Storage Integration Test!';
        const blob = new Blob([dummyContent], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, 'test_report.pdf');
        formData.append('patientId', data.patient._id.toString());
        formData.append('documentType', 'LabReport');
        formData.append('linkedEMR', new mongoose.Types.ObjectId().toString());

        const uploadRes = await fetch(`${BASE_URL}/secure-storage/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${data.doctorToken}` },
            body: formData
        });

        const uploadData = await uploadRes.json();
        
        if (!uploadRes.ok) {
            throw new Error(`Upload Failed: ${JSON.stringify(uploadData)}`);
        }
        
        const documentId = uploadData.metadata.fileId;
        console.log(`✅ Upload Success! DocID: ${documentId}`);
        console.log(`   IPFS CID: ${uploadData.metadata.ipfsCid}`);
        console.log(`   TxHash: ${uploadData.metadata.transactionHash}`);

        // 2. Fetch Storage Stats
        console.log('\n[TEST 2] Fetch Storage Statistics');
        const statsRes = await fetch(`${BASE_URL}/secure-storage/stats`, {
            headers: { 'Authorization': `Bearer ${data.doctorToken}` }
        });
        const statsData = await statsRes.json();
        if (!statsRes.ok) throw new Error(`Stats Failed: ${JSON.stringify(statsData)}`);
        console.log(`✅ Stats Success! Total files: ${statsData.totalFiles}`);

        // 3. Download Document
        console.log('\n[TEST 3] Doctor Downloads Secure Document');
        const downloadRes = await fetch(`${BASE_URL}/secure-storage/download/${documentId}`, {
            headers: { 'Authorization': `Bearer ${data.doctorToken}` }
        });
        if (!downloadRes.ok) {
            const errBody = await downloadRes.text();
            throw new Error(`Download Failed: ${errBody}`);
        }
        const downloadedText = await downloadRes.text();
        if (downloadedText !== dummyContent) {
            throw new Error('Downloaded content does not match original!');
        }
        console.log(`✅ Download Success! Content verified.`);

        // 4. Verify Integrity
        console.log('\n[TEST 4] Verify Document Integrity');
        const verifyRes = await fetch(`${BASE_URL}/secure-storage/verify/${documentId}`, {
            headers: { 'Authorization': `Bearer ${data.doctorToken}` }
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.verified) {
            throw new Error(`Verification Failed: ${JSON.stringify(verifyData)}`);
        }
        console.log(`✅ Integrity Verified On-Chain!`);

        // 5. Unauthorized Access Check (should fail)
        console.log('\n[TEST 5] Unauthorized Access Check (should fail)');
        // Create an unauthorized user
        const unauthorizedUser = await User.create({
            name: 'Unauthorized Doctor',
            email: `unauth_${Date.now()}@hospital.com`,
            password: 'password123',
            role: 'doctor'
        });
        const badToken = generateToken(unauthorizedUser._id);
        
        const failRes = await fetch(`${BASE_URL}/secure-storage/verify/${documentId}`, {
            headers: { 'Authorization': `Bearer ${badToken}` }
        });

        if (failRes.status !== 403) {
            throw new Error(`Expected 403 Forbidden, got ${failRes.status}`);
        }
        console.log(`✅ Unauthorized access correctly blocked (403).`);

        // Clean up
        await unauthorizedUser.deleteOne();

        // 6. Delete Document
        console.log('\n[TEST 6] Delete Secure Document');
        const deleteRes = await fetch(`${BASE_URL}/secure-storage/${documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${data.patientToken}` } // Patient deletes own file
        });
        if (!deleteRes.ok) {
            const errBody = await deleteRes.text();
            throw new Error(`Delete Failed: ${errBody}`);
        }
        console.log(`✅ Delete Success!`);

        console.log('\n🎉 ALL INTEGRATION TESTS PASSED 🎉');

    } catch (err) {
        console.error('\n❌ INTEGRATION TEST FAILED:');
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        // Cleanup
        console.log('\nShutting down server...');
        server.close();
        mongoose.connection.close();
    }
}

// Start Server & Run
server = app.listen(PORT, () => {
    console.log(`Test server listening on port ${PORT}`);
    runTests();
});
