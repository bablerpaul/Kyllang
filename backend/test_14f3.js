const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const User = require('./models/User');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const Consent = require('./models/Consent');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');
const jwt = require('jsonwebtoken');
const { startBlockchainWorker, stopBlockchainWorker } = require('./src/jobs/blockchainWorker');
const storageService = require('./src/modules/secure-storage/services/storageService');
const { connectDB } = require('./src/config/db');

const BASE_URL = 'http://127.0.0.1:5000/api';

async function runMatrix() {
    console.log('--- STARTING 14F-3 MATRIX TEST ---');
    await connectDB();

    // 1. Setup user context
    await User.deleteMany({ email: 'p14f3@test.com' });
    const pUser = await User.create({ name: 'P14F3', email: 'p14f3@test.com', password: 'password123', role: 'general_user' });
    const patient = await Patient.create({ user: pUser._id, name: 'P14F3', dob: new Date(), gender: 'Male' });
    const pToken = jwt.sign({ id: pUser._id, role: 'general_user' }, process.env.JWT_SECRET || 'secret_key');

    // MOCK UPLOAD Helper
    async function upload(content) {
        const formData = new FormData();
        const blob = new Blob([content], { type: 'application/pdf' });
        formData.append('file', blob, 'test.pdf');
        formData.append('patientId', patient._id.toString());
        formData.append('documentType', 'LabReport');
        
        const res = await fetch(`${BASE_URL}/secure-storage/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${pToken}` },
            body: formData
        });
        const data = await res.json();
        return data.data.metadata;
    }

    // A. TEST B - PENDING
    console.log('\n[TEST B] PENDING STATE (before worker)');
    const metaPending = await upload('PENDING_PAYLOAD');
    let verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status, '| Local Valid?', verifyRes.generatedHash === verifyRes.expectedHash);
    try {
        await storageService.retrieveSecurePayload(metaPending.fileId);
        console.log('Download allowed? YES');
    } catch (e) {
        console.log('Download Error:', e.message);
    }

    // B. TEST A - CONFIRMED
    console.log('\n[TEST A] CONFIRMED STATE (run worker)');
    startBlockchainWorker();
    await new Promise(r => setTimeout(r, 6000)); // wait for block
    
    verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status);
    try {
        await storageService.retrieveSecurePayload(metaPending.fileId);
        console.log('Download allowed? YES');
    } catch (e) {
        console.log('Download Error:', e.message);
    }
    stopBlockchainWorker();

    // C. TEST E - FAILED ANCHOR
    console.log('\n[TEST E] FAILED ANCHOR');
    const fvFailed = await FileVersion.findOne({ secureFile: metaPending.fileId });
    fvFailed.blockchainStatus = 'failed';
    await fvFailed.save();
    verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status);
    try {
        await storageService.retrieveSecurePayload(metaPending.fileId);
        console.log('Download allowed? YES');
    } catch (e) {
        console.log('Download Error:', e.message);
    }
    fvFailed.blockchainStatus = 'confirmed';
    await fvFailed.save();

    // D. TEST C - TAMPER
    console.log('\n[TEST C] TAMPER (Modify IPFS object)');
    const ipfsDir = 'C:\\main project\\kubo\\blocks';
    // Simulate by manually altering the fetch payload mock... wait, real IPFS is immutable.
    // I can simulate it by altering the expected hash in the DB!
    const originalHash = fvFailed.dataHash;
    fvFailed.dataHash = 'fakehash123';
    await fvFailed.save();
    
    verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status);
    try {
        await storageService.retrieveSecurePayload(metaPending.fileId);
        console.log('Download allowed? YES');
    } catch (e) {
        console.log('Download Error:', e.message);
    }

    // E. TEST D - RESTORE
    console.log('\n[TEST D] RESTORE');
    fvFailed.dataHash = originalHash;
    await fvFailed.save();
    verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status);
    
    // F. TEST F - SWAP WITH VALID PAYLOAD
    console.log('\n[TEST F] SWAP WITH VALID BLOCKCHAIN PAYLOAD');
    const metaB = await upload('VALID_PAYLOAD_2');
    startBlockchainWorker();
    await new Promise(r => setTimeout(r, 6000));
    stopBlockchainWorker();
    
    const fvB = await FileVersion.findOne({ secureFile: metaB.fileId });
    // Swap CID of file A with CID of file B
    fvFailed.ipfsCid = fvB.ipfsCid;
    await fvFailed.save();
    
    verifyRes = await storageService.verifyIntegrity(metaPending.fileId);
    console.log('Verify Status:', verifyRes.status);
    try {
        await storageService.retrieveSecurePayload(metaPending.fileId);
        console.log('Download allowed? YES');
    } catch (e) {
        console.log('Download Error:', e.message);
    }

    console.log('\n--- TESTS COMPLETED ---');
    process.exit(0);
}

runMatrix().catch(console.error);
