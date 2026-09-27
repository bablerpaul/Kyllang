const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

require('dotenv').config();
// MUST BE FALSE for real IPFS testing
process.env.TEST_MODE = 'false';

const app = require('./index');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Consent = require('./models/Consent');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');

const PORT = 5099; // Different port to avoid conflict
const BASE_URL = `http://localhost:${PORT}/api`;
let server;

function generateToken(id, role) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1d' });
}

async function runTest() {
    try {
        console.log('--- STARTING 14F REAL IPFS REGRESSION TEST ---');
        await new Promise(resolve => mongoose.connection.once('open', resolve));

        // Setup Test Users
        await User.deleteMany({ email: { $in: ['p14f@test.com', 'd14f@test.com', 'u14f@test.com', 'd14f_no_consent@test.com', 'a14f@test.com'] } });
        await Consent.deleteMany({ patientId: { $exists: true } });
        
        const pUser = await User.create({ name: 'P14F2', email: 'p14f@test.com', password: 'password123', role: 'general_user' });
        const dUser = await User.create({ name: 'D14F2', email: 'd14f@test.com', password: 'password123', role: 'doctor' });
        const uUser = await User.create({ name: 'U14F2', email: 'u14f@test.com', password: 'password123', role: 'general_user' }); // Unauthorized patient
        const dNoConsent = await User.create({ name: 'D14F2_NoConsent', email: 'd14f_no_consent@test.com', password: 'password123', role: 'doctor' }); 
        const adminUser = await User.create({ name: 'Admin14F2', email: 'a14f@test.com', password: 'password123', role: 'hospital_admin' });

        const patient = await Patient.create({ user: pUser._id, name: 'P14F2', dob: new Date(), gender: 'Male', assignedDoctors: [dUser._id] });

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

        console.log('\n[TEST A] Kyllang Upload -> Real IPFS');
        const testContentA = 'Kyllang Secure Storage 14F\nREAL IPFS TEST\nSynthetic data only.\nNo patient information.';
        const metaA = await uploadFile(testContentA, 'Kyllang_14F2_Blockchain_Test.pdf', dToken);
        console.log('File A ID:', metaA.fileId);
        console.log('CID:', metaA.ipfsCid);
        console.log('Is Genuine CID (not mock_):', !metaA.ipfsCid.startsWith('mock_'));
        const fvA = await FileVersion.findOne({ secureFile: metaA.fileId });
        console.log('FileVersion ID:', fvA._id);
        console.log('DataHash stored:', fvA.dataHash);

        console.log('\n[TEST C] Direct CID Verification');
        let cidRes = await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${metaA.ipfsCid}`, { method: 'POST' });
        const rawBytes = await cidRes.arrayBuffer();
        console.log('Direct CID resolve status:', cidRes.status);
        console.log('Bytes exist:', rawBytes.byteLength > 0);
        // It's encrypted bytes, just checking it's not a mock string
        const isFakeMock = Buffer.from(rawBytes).toString('utf8').includes('mock_content');
        console.log('Is fake mock content:', isFakeMock);

        console.log('\nWaiting 15 seconds for Blockchain Queue worker to mine the transaction...');
        await new Promise(r => setTimeout(r, 15000));

        console.log('\n[TEST B] Real IPFS Retrieval (through app)');
        let res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const contentA = await res.text();
        console.log('Decrypted content matches original test content:', contentA === testContentA);

        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyA = await res.json();
        console.log('Verify A:', verifyA.data?.verificationDetails?.verified);
        
        console.log('\n[TEST G] Access Control (IDOR)');
        let resUnauthPatient = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${uToken}` } });
        console.log('Unauthorized Patient Status:', resUnauthPatient.status, '(Expected 403)');
        
        let resNoConsentDoc = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${dNoConsentToken}` } });
        console.log('Doctor without consent Status:', resNoConsentDoc.status, '(Expected 403)');
        
        let resOwner = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${pToken}` } });
        console.log('Owner Status:', resOwner.status, '(Expected 200)');
        
        let resAdmin = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        console.log('Admin Status:', resAdmin.status, '(Expected 200)');

        console.log('\n[TEST D] 14D Hash Binding with Real IPFS (Swap)');
        const metaB = await uploadFile('FILE_B_SYNTHETIC', 'test_14f_B.pdf', dToken);
        console.log('File B CID:', metaB.ipfsCid);
        
        // Swap CID in DB
        await FileVersion.updateOne({ _id: fvA._id }, { $set: { ipfsCid: metaB.ipfsCid } });

        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifySwapped = await res.json();
        console.log('Swapped Verify Result:', verifySwapped.data?.verificationDetails?.verified === true ? true : false);

        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        console.log('Swapped Download Status:', res.status, '(Expected 500)');

        console.log('\n[TEST E] Restore & Persistence (Simulating app restart via DB restore)');
        await FileVersion.updateOne({ _id: fvA._id }, { $set: { ipfsCid: metaA.ipfsCid } });
        
        res = await fetch(`${BASE_URL}/secure-storage/verify/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        let verifyRestored = await res.json();
        console.log('Restored Verify Result:', verifyRestored.data?.verificationDetails?.verified);

        res = await fetch(`${BASE_URL}/secure-storage/download/${metaA.fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const contentRestored = await res.text();
        console.log('Restored content matches original:', contentRestored === testContentA);

        console.log('\n[TEST I] Delete Behavior');
        const delRes = await fetch(`${BASE_URL}/secure-storage/${metaA.fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${dToken}` }});
        console.log('Delete Status:', delRes.status, '(Expected 200)');
        
        const findDoc = await SecureFile.findById(metaA.fileId);
        const findVer = await FileVersion.findOne({ secureFile: metaA.fileId });
        console.log('MongoDB metadata cleared:', !findDoc && !findVer);
        
        // Check if real IPFS object is deleted or persisted (IPFS objects are immutable and kept unless GC'd)
        let checkIpfs = await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${metaA.ipfsCid}`, { method: 'POST' });
        console.log('IPFS physical object still available (immutable):', checkIpfs.status === 200);

        // Cleanup the rest
        // await fetch(`${BASE_URL}/secure-storage/${metaB.fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${dToken}` }});
        
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
