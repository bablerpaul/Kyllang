const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('dotenv').config();
process.env.TEST_MODE = 'true';

const app = require('./index');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Consent = require('./models/Consent');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');

const PORT = 5098;
const BASE_URL = `http://localhost:${PORT}/api`;
let server;

function generateToken(id, role) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1d' });
}

async function runTest() {
    try {
        console.log('--- STARTING 14D E2E TEST ---');
        await new Promise(resolve => mongoose.connection.once('open', resolve));

        // Setup Test Users
        await User.deleteMany({ email: { $in: ['p14d@test.com', 'd14d@test.com'] } });
        await Consent.deleteMany({ patientId: { $exists: true } });
        
        const pUser = await User.create({ name: 'P14D', email: 'p14d@test.com', password: 'password123', role: 'general_user' });
        const dUser = await User.create({ name: 'D14D', email: 'd14d@test.com', password: 'password123', role: 'doctor' });
        const patient = await Patient.create({ user: pUser._id, name: 'P14D', dob: new Date(), gender: 'Male', assignedDoctors: [dUser._id] });

        await Consent.create({
            patient: patient._id,
            patientId: pUser._id,
            grantedTo: dUser._id,
            grantedToRole: 'doctor',
            status: 'active',
            grantedAt: new Date()
        });

        const dToken = generateToken(dUser._id, 'doctor');

        // Helper function for uploading
        async function uploadFile(content, fileName) {
            const blob = new Blob([content], { type: 'application/pdf' });
            const formData = new FormData();
            formData.append('file', blob, fileName);
            formData.append('patientId', patient._id.toString());
            formData.append('documentType', 'LabReport');
            formData.append('linkedEMR', new mongoose.Types.ObjectId().toString());
            
            const res = await fetch(`${BASE_URL}/secure-storage/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${dToken}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Upload failed');
            return data.data.metadata;
        }

        console.log('\n[TEST 1] Upload Valid Payload A');
        const metaA = await uploadFile('FILE_A_CONTENT', 'test_A.pdf');
        console.log('File A ID:', metaA.fileId, 'Hash:', metaA.dataHash);

        console.log('\n[TEST 1] Verify Valid Payload A');
        let res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyA = await res.json();
        console.log('Verify A:', verifyA.data?.verificationDetails?.verified);

        console.log('\n[TEST 3] Swapped Payload');
        console.log('Uploading Valid Payload B...');
        const metaB = await uploadFile('FILE_B_CONTENT', 'test_B.pdf');
        
        console.log('Swapping File A payload with File B payload on disk...');
        const fallbackDir = path.join(__dirname, 'uploads/fallback-storage');
        const pathA = path.join(fallbackDir, metaA.ipfsCid);
        const pathB = path.join(fallbackDir, metaB.ipfsCid);
        
        const originalBufferA = fs.readFileSync(pathA);
        const originalBufferB = fs.readFileSync(pathB);
        
        // Swap A with B
        fs.writeFileSync(pathA, originalBufferB);

        console.log('Verifying File A after swap...');
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifySwapped = await res.json();
        console.log('Swapped Verify Result:', verifySwapped.data?.verificationDetails?.verified);

        console.log('Downloading File A after swap...');
        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const downloadStatus = res.status;
        let downloadErrorText = '';
        if (downloadStatus !== 200) {
            const err = await res.json();
            downloadErrorText = err.message || err.error;
        }
        console.log('Download Status:', downloadStatus, downloadErrorText);

        console.log('\n[TEST 2] Tampered Payload (Corrupted)');
        // Tamper it completely (append 'x')
        fs.writeFileSync(pathA, Buffer.concat([originalBufferB, Buffer.from('x')]));
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyTampered = await res.json();
        console.log('Tampered Verify Result:', verifyTampered.data?.verificationDetails?.verified);

        console.log('\n[TEST 4] Restore Original Payload');
        fs.writeFileSync(pathA, originalBufferA);
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyRestored = await res.json();
        console.log('Restored Verify Result:', verifyRestored.data?.verificationDetails?.verified);

        console.log('\n[TEST 5] Normal Retrieval');
        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const contentA = await res.text();
        console.log('Decrypted content A matches original:', contentA === 'FILE_A_CONTENT');

        // Cleanup
        await fetch(`${BASE_URL}/secure-storage/${metaA.fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${dToken}` }});
        await fetch(`${BASE_URL}/secure-storage/${metaB.fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${dToken}` }});
        if (fs.existsSync(pathA)) fs.unlinkSync(pathA);
        if (fs.existsSync(pathB)) fs.unlinkSync(pathB);

        console.log('\n--- TESTS COMPLETED ---');
    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        server.close();
        mongoose.connection.close();
        process.exit();
    }
}

server = app.listen(PORT, () => {
    runTest();
});
