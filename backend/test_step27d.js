const mongoose = require('mongoose');

async function testStep27D() {
    const baseURL = 'http://localhost:5000/api';

    try {
        console.log("=== STEP 27D AUTOMATED TEST ===");
        
        await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
        console.log("Connected to MongoDB.");

        const User = require('./models/User');
        const Patient = require('./models/Patient');
        const MedicalRecord = require('./models/MedicalRecord');

        // Find a doctor and a patient
        const doctorUser = await User.findOne({ role: 'doctor' });
        const patientUser = await User.findOne({ role: 'general_user' });

        if (!doctorUser || !patientUser) {
            console.error("Missing test users");
            process.exit(1);
        }

        const patient = await Patient.findOne({ user: patientUser._id });

        // Generate tokens
        const jwt = require('jsonwebtoken');
        const docToken = jwt.sign({ id: doctorUser._id, role: 'doctor' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });
        const patToken = jwt.sign({ id: patientUser._id, role: 'general_user' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });

        console.log("\n1. DOCTOR CREATES TEST EMR");
        const emrData = {
            patientId: patient._id.toString(),
            diagnosis: 'Step 27D Priority Test Encounter',
            symptoms: ['Testing Priority'],
            clinicalNotes: 'Test Encounter for Verification Priority',
            visitDate: new Date().toISOString()
        };

        const res = await fetch(`${baseURL}/emr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
            body: JSON.stringify(emrData)
        }).then(r => r.json());
        
        console.log("EMR Created:", res.success);
        const emrId = res.data.emr._id;
        
        // Wait a small moment for db to sync
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log("\nTEST 1: UNTAMPERED UNANCHORED EMR");
        let verRes = await fetch(`${baseURL}/emr/${emrId}/verify`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        console.log("Expected: NOT BLOCKCHAIN VERIFIED");
        console.log("Actual:", verRes.message);

        console.log("\nTEST 2: TAMPERED UNANCHORED EMR (Clinical Data)");
        await MedicalRecord.findByIdAndUpdate(emrId, { diagnosis: 'Tampered Diagnosis' });
        
        verRes = await fetch(`${baseURL}/emr/${emrId}/verify`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        console.log("Expected: INTEGRITY MISMATCH");
        console.log("Actual:", verRes.message);

        console.log("\nTEST 3: TAMPERED STORED HASH");
        // Revert clinical data, tamper stored hash
        await MedicalRecord.findByIdAndUpdate(emrId, { diagnosis: 'Step 27D Priority Test Encounter', dataHash: 'tamperedhash123' });
        
        verRes = await fetch(`${baseURL}/emr/${emrId}/verify`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        console.log("Expected: INTEGRITY MISMATCH");
        console.log("Actual:", verRes.message);

        console.log("\n4. CLEANUP");
        await MedicalRecord.findByIdAndDelete(emrId);
        console.log("Cleanup complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

testStep27D();
