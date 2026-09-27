const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const LabReport = require('./models/LabReport');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');
const AuditLog = require('./models/AuditLog');
const User = require('./models/User');
const DoctorProfile = require('./models/Doctor');
const PatientProfile = require('./models/Patient');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    console.log('Connected to DB');

    const mriLabId = '6ab6c5bf1d831242a5b0e859';
    const mriSecureFileId = '6ab6c5bf1d831242a5b0e85a';

    // 1. Get original DB metadata
    const secureFile = await SecureFile.findById(mriSecureFileId);
    const fileVersion = await FileVersion.findOne({ secureFile: mriSecureFileId });

    console.log(`Original DB Metadata:`);
    console.log(`- FileVersion hash: ${fileVersion.dataHash}`);
    console.log(`- FileVersion size: ${fileVersion.fileSize}`);
    console.log(`- FileVersion CID: ${fileVersion.ipfsCid}`);
    
    const jwt = require('jsonwebtoken');
    const jwtSecret = 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV';
    
    // Find patient user
    const patientUser = await User.findOne({ email: 'testpatient1@test.com' });
    const patientToken = jwt.sign({ id: patientUser._id, role: patientUser.role }, jwtSecret, { expiresIn: '1d' });

    if (patientToken) {
        try {
            const dlRes = await axios.get(`http://localhost:5000/api/secure-storage/download/${mriSecureFileId}`, {
                headers: { Authorization: `Bearer ${patientToken}`, 'Origin': 'http://localhost:5173' },
                responseType: 'arraybuffer'
            });
            const buffer = dlRes.data;
            const size = buffer.length;
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            
            let filename = 'unknown';
            const disposition = dlRes.headers['content-disposition'];
            if (disposition && disposition.indexOf('filename=') !== -1) {
                const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }
            console.log(`\nPatient Download Result:`);
            console.log(`- Filename: ${filename}`);
            console.log(`- Downloaded Size: ${size} bytes`);
            console.log(`- Downloaded Hash: ${hash}`);
            console.log(`- File Readable (not HTML/JSON): ${!buffer.toString('utf8').includes('<!DOCTYPE html>') && !buffer.toString('utf8').startsWith('{')}`);
            console.log(`- Hash matches FileVersion: ${hash === fileVersion.dataHash}`);
            console.log(`- Size matches FileVersion: ${size === fileVersion.fileSize}`);
        } catch (e) {
            console.error('Patient download failed:', e.response?.data?.toString() || e.message);
        }
    }

    // 3. Patient Isolation Verification (Try to fetch another SecureFile)
    const otherSecureFile = await SecureFile.findOne({ patient: { $ne: secureFile.patient } });
    if (otherSecureFile && patientToken) {
        try {
            await axios.get(`http://localhost:5000/api/secure-storage/download/${otherSecureFile._id}`, {
                headers: { Authorization: `Bearer ${patientToken}`, 'Origin': 'http://localhost:5173' }
            });
            console.log(`\nPatient Isolation: FAILED. Downloaded another patient's file.`);
        } catch (e) {
            console.log(`\nPatient Isolation: SUCCESS. Attempting to download another patient's file resulted in status ${e.response?.status} (${e.response?.data?.message || e.message})`);
        }
    }

    // 4. Doctor Download Verification
    const doctorUser = await User.findOne({ email: 'testdoctor1@test.com' });
    const doctorToken = jwt.sign({ id: doctorUser._id, role: doctorUser.role }, jwtSecret, { expiresIn: '1d' });

    if (doctorToken) {
        try {
            const dlRes = await axios.get(`http://localhost:5000/api/secure-storage/download/${mriSecureFileId}`, {
                headers: { Authorization: `Bearer ${doctorToken}`, 'Origin': 'http://localhost:5173' },
                responseType: 'arraybuffer'
            });
            console.log(`Doctor Download Result: SUCCESS (${dlRes.data.length} bytes)`);
        } catch (e) {
            console.error('Doctor download failed:', e.response?.data?.toString() || e.message);
        }
    }

    // 5. DB Counts
    console.log(`\nDatabase Counts:`);
    console.log(`- Users: ${await User.countDocuments()}`);
    console.log(`- Doctors: ${await DoctorProfile.countDocuments()}`);
    console.log(`- Patients: ${await PatientProfile.countDocuments()}`);
    console.log(`- LabReports: ${await LabReport.countDocuments()}`);
    console.log(`- SecureFiles: ${await SecureFile.countDocuments()}`);
    console.log(`- FileVersions: ${await FileVersion.countDocuments()}`);
    console.log(`- AuditLogs: ${await AuditLog.countDocuments()}`);
    
    mongoose.disconnect();
}

run().catch(console.error);
