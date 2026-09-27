const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('dotenv').config();
process.env.TEST_MODE = 'true'; // Prevent blockchain/IPFS hangs

const app = require('./index');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Consent = require('./models/Consent');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');

const PORT = 5098;
const BASE_URL = `http://localhost:${PORT}/api`;
let server;

const DUMMY_CONTENT = `SECURE_STORAGE_TEST_14C\nThis is synthetic test data only.\nNo real patient information.`;

function generateToken(id, role) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1d' });
}

async function runTest() {
    try {
        console.log('--- STARTING 14C E2E TEST ---');
        await new Promise(resolve => mongoose.connection.once('open', resolve));

        // Setup Test Users
        await User.deleteMany({ email: { $in: ['p14c@test.com', 'd14c@test.com', 'u14c@test.com'] } });
        await Consent.deleteMany({ patientId: { $exists: true } }); // Clear just to be safe
        
        const pUser = await User.create({ name: 'P14C', email: 'p14c@test.com', password: 'password123', role: 'general_user' });
        const dUser = await User.create({ name: 'D14C', email: 'd14c@test.com', password: 'password123', role: 'doctor' });
        const unauthUser = await User.create({ name: 'U14C', email: 'u14c@test.com', password: 'password123', role: 'doctor' });
        const patient = await Patient.create({ user: pUser._id, name: 'P14C', dob: new Date(), gender: 'Male', assignedDoctors: [dUser._id] });

        // Create explicit consent
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
        const uToken = generateToken(unauthUser._id, 'doctor');

        // TEST A: Upload
        console.log('\n[TEST A] Authenticated Upload');
        const blob = new Blob([DUMMY_CONTENT], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, 'test_14c.pdf');
        formData.append('patientId', patient._id.toString());
        formData.append('documentType', 'LabReport');
        formData.append('linkedEMR', new mongoose.Types.ObjectId().toString());
        
        const uploadRes = await fetch(`${BASE_URL}/secure-storage/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${dToken}` },
            body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`Upload Failed: ${JSON.stringify(uploadData)}`);
        
        const fileId = uploadData.data.metadata.fileId;
        const cid = uploadData.data.metadata.ipfsCid;
        console.log('Upload Success! FileID:', fileId);
        console.log('CID:', cid);
        console.log('DataHash:', uploadData.data.metadata.dataHash);

        // TEST C: Retrieval/Decryption
        console.log('\n[TEST C] Retrieval & Decryption');
        const downloadRes = await fetch(`${BASE_URL}/secure-storage/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        const downloadedText = await downloadRes.text();
        console.log('Decrypted content matches original:', downloadedText === DUMMY_CONTENT);

        // TEST F: Access Control
        console.log('\n[TEST F] Access Control (IDOR)');
        const unauthRes = await fetch(`${BASE_URL}/secure-storage/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${uToken}` }
        });
        console.log('Unauthorized fetch status:', unauthRes.status, '(Expected: 403)');

        // TEST G: Integrity/Tamper Detection
        console.log('\n[TEST G] Tamper Detection');
        const fallbackDir = path.join(__dirname, 'uploads/fallback-storage');
        const fallbackPath = path.join(fallbackDir, cid);
        if (fs.existsSync(fallbackPath)) {
            const originalBuffer = fs.readFileSync(fallbackPath);
            // Append a byte to corrupt it
            fs.writeFileSync(fallbackPath, Buffer.concat([originalBuffer, Buffer.from('x')]));
            
            const verifyRes = await fetch(`${BASE_URL}/secure-storage/verify/${fileId}`, {
                headers: { 'Authorization': `Bearer ${dToken}` }
            });
            let verifyData;
            try {
                verifyData = await verifyRes.json();
            } catch (e) {
                verifyData = await verifyRes.text();
            }
            console.log('Verification after tamper:', verifyData);
            
            // Restore it
            fs.writeFileSync(fallbackPath, originalBuffer);
            console.log('Fallback file restored.');
        } else {
            console.log('Fallback file not found on disk!');
        }
        
        // TEST H: Delete
        console.log('\n[TEST H] Delete Behavior');
        const delRes = await fetch(`${BASE_URL}/secure-storage/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${dToken}` }
        });
        console.log('Delete status:', delRes.status);
        const findDoc = await SecureFile.findById(fileId);
        const findVer = await FileVersion.findOne({ secureFile: fileId });
        console.log('MongoDB metadata cleared:', !findDoc && !findVer);
        console.log('Fallback file still on disk (IPFS immutable mimic):', fs.existsSync(fallbackPath));
        if (fs.existsSync(fallbackPath)) fs.unlinkSync(fallbackPath); // Clean up for next tests

        console.log('\n--- TESTS COMPLETED ---');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        server.close();
        mongoose.connection.close();
        process.exit();
    }
}

server = app.listen(PORT, () => {
    runTest();
});
