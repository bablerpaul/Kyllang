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
        console.log('--- STARTING 14E REGRESSION TEST ---');
        await new Promise(resolve => mongoose.connection.once('open', resolve));

        // Setup Test Users
        await User.deleteMany({ email: { $in: ['p14e@test.com', 'd14e@test.com', 'u14e@test.com', 'd14e_no_consent@test.com'] } });
        await Consent.deleteMany({ patientId: { $exists: true } });
        
        const pUser = await User.create({ name: 'P14E', email: 'p14e@test.com', password: 'password123', role: 'general_user' });
        const dUser = await User.create({ name: 'D14E', email: 'd14e@test.com', password: 'password123', role: 'doctor' });
        const uUser = await User.create({ name: 'U14E', email: 'u14e@test.com', password: 'password123', role: 'general_user' }); // Unauthorized patient
        const dNoConsent = await User.create({ name: 'D14E_NoConsent', email: 'd14e_no_consent@test.com', password: 'password123', role: 'doctor' }); 
        const adminUser = await User.create({ name: 'Admin14E', email: 'a14e@test.com', password: 'password123', role: 'hospital_admin' });

        const patient = await Patient.create({ user: pUser._id, name: 'P14E', dob: new Date(), gender: 'Male', assignedDoctors: [dUser._id] });

        await Consent.create({
            patient: patient._id,
            patientId: pUser._id,
            grantedTo: dUser._id,
            grantedToRole: 'doctor',
            status: 'active',
            grantedAt: new Date()
        });

        const pToken = generateToken(pUser._id, 'general_user');
        const dToken = generateToken(dUser._id, 'doctor');
        const uToken = generateToken(uUser._id, 'general_user');
        const dNoConsentToken = generateToken(dNoConsent._id, 'doctor');
        const adminToken = generateToken(adminUser._id, 'hospital_admin');

        // Helper function for uploading
        async function uploadFile(content, fileName, token) {
            const blob = new Blob([content], { type: 'application/pdf' });
            const formData = new FormData();
            formData.append('file', blob, fileName);
            formData.append('patientId', patient._id.toString());
            formData.append('documentType', 'LabReport');
            formData.append('linkedEMR', new mongoose.Types.ObjectId().toString());
            
            const res = await fetch(`${BASE_URL}/secure-storage/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Upload failed');
            return data.data.metadata;
        }

        console.log('\n[TEST 1] Valid Upload');
        const metaA = await uploadFile('SECURE_STORAGE_14E_TEST\nSynthetic data only.\nNo real patient information.', 'test_14e_A.pdf', dToken);
        console.log('File A ID:', metaA.fileId, 'Hash:', metaA.dataHash);
        const fvA = await FileVersion.findOne({ secureFile: metaA.fileId });
        console.log('FileVersion ID:', fvA._id);

        console.log('\n[TEST 2] Valid Retrieval');
        let res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const contentA = await res.text();
        console.log('Decrypted content A matches original:', contentA === 'SECURE_STORAGE_14E_TEST\nSynthetic data only.\nNo real patient information.');

        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyA = await res.json();
        console.log('Verify A:', verifyA.data?.verificationDetails?.verified);
        
        console.log('\n[TEST 7] Access Control (IDOR)');
        let resUnauthPatient = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${uToken}` } });
        console.log('Unauthorized Patient Status:', resUnauthPatient.status, '(Expected 403)');
        
        let resNoConsentDoc = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${dNoConsentToken}` } });
        console.log('Doctor without consent Status:', resNoConsentDoc.status, '(Expected 403)');
        
        let resOwner = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${pToken}` } });
        console.log('Owner Status:', resOwner.status, '(Expected 200)');
        
        let resAdmin = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        console.log('Admin Status:', resAdmin.status, '(Expected 200)');

        console.log('\n[TEST 4] Swap Regression');
        const metaB = await uploadFile('FILE_B_SYNTHETIC', 'test_14e_B.pdf', dToken);
        const fallbackDir = path.join(__dirname, 'uploads/fallback-storage');
        const pathA = path.join(fallbackDir, metaA.ipfsCid);
        const pathB = path.join(fallbackDir, metaB.ipfsCid);
        
        const originalBufferA = fs.readFileSync(pathA);
        const originalBufferB = fs.readFileSync(pathB);
        
        fs.writeFileSync(pathA, originalBufferB);

        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifySwapped = await res.json();
        console.log('Swapped Verify Result:', verifySwapped.data?.verificationDetails?.verified || false);

        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        console.log('Swapped Download Status:', res.status, '(Expected 500)');

        console.log('\n[TEST 3] Tamper Regression (Corrupted)');
        fs.writeFileSync(pathA, Buffer.concat([originalBufferB, Buffer.from('x')]));
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyTampered = await res.json();
        console.log('Tampered Verify Result:', verifyTampered.data?.verificationDetails?.verified || false);

        console.log('\n[TEST 5 & 6] Restore & Persistence');
        fs.writeFileSync(pathA, originalBufferA);
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyRestored = await res.json();
        console.log('Restored Verify Result:', verifyRestored.data?.verificationDetails?.verified);

        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const contentRestored = await res.text();
        console.log('Restored content matches original:', contentRestored === 'SECURE_STORAGE_14E_TEST\nSynthetic data only.\nNo real patient information.');

        console.log('\n[TEST 8] Delete Regression');
        const delRes = await fetch(`${BASE_URL}/secure-storage/${metaA.fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${dToken}` }});
        console.log('Delete Status:', delRes.status, '(Expected 200)');
        
        const findDoc = await SecureFile.findById(metaA.fileId);
        const findVer = await FileVersion.findOne({ secureFile: metaA.fileId });
        console.log('MongoDB metadata cleared:', !findDoc && !findVer);
        console.log('Fallback file still on disk (IPFS immutable mimic):', fs.existsSync(pathA));

        // Cleanup the rest
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
