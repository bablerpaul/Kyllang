const mongoose = require('mongoose');

async function testStep27B() {
    const baseURL = 'http://localhost:5000/api';

    try {
        console.log("=== STEP 27B AUTOMATED TEST ===");
        
        await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
        console.log("Connected to MongoDB.");

        const User = require('./models/User');
        const Patient = require('./models/Patient');
        const Doctor = require('./models/Doctor');
        const MedicalRecord = require('./models/MedicalRecord');

        // Find a doctor and a patient
        const doctorUser = await User.findOne({ role: 'doctor' });
        const patientUser = await User.findOne({ role: 'general_user' });
        const patientUser2 = await User.findOne({ role: 'general_user', _id: { $ne: patientUser._id } });

        if (!doctorUser || !patientUser) {
            console.error("Missing test users");
            process.exit(1);
        }

        const patient = await Patient.findOne({ user: patientUser._id });

        // Generate tokens
        const jwt = require('jsonwebtoken');
        const docToken = jwt.sign({ id: doctorUser._id, role: 'doctor' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });
        const patToken = jwt.sign({ id: patientUser._id, role: 'general_user' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });
        let patToken2 = null;
        if (patientUser2) {
             patToken2 = jwt.sign({ id: patientUser2._id, role: 'general_user' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });
        }

        console.log("\n1. DOCTOR CREATES EMR 1");
        const emr1Data = {
            patientId: patient._id.toString(),
            diagnosis: 'Step 27B Test Encounter 1',
            symptoms: ['Fever', 'Cough'],
            vitalSigns: { bloodPressure: '120/80', heartRate: 72, temperature: 99.1 },
            clinicalNotes: 'Test Encounter 1 notes',
            visitDate: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        };

        const res1 = await fetch(`${baseURL}/emr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
            body: JSON.stringify(emr1Data)
        }).then(r => r.json());
        
        console.log("RES1:", res1);
        console.log("EMR 1 Created:", res1.success);
        const emr1Id = res1.data.emr._id;

        console.log("\n2. DOCTOR CREATES EMR 2");
        const emr2Data = {
            patientId: patient._id.toString(),
            diagnosis: 'Step 27B Test Encounter 2',
            symptoms: ['Headache'],
            vitalSigns: { bloodPressure: '118/76', heartRate: 68, temperature: 98.6 },
            clinicalNotes: 'Test Encounter 2 notes',
            visitDate: new Date().toISOString() // Now
        };
        const res2 = await fetch(`${baseURL}/emr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
            body: JSON.stringify(emr2Data)
        }).then(r => r.json());
        console.log("EMR 2 Created:", res2.success);
        const emr2Id = res2.data.emr._id;

        console.log("\n3. PATIENT FETCHES RECORDS (/api/emr/records)");
        const recRes = await fetch(`${baseURL}/emr/records`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        
        console.log("RECORDS RESPONSE:", recRes);
        const recordsData = recRes.data;
        console.log("Profile Vitals:", recordsData.vitals);
        console.log("EMR History Count:", recordsData.emrHistory.length);
        console.log("EMR 1 (Latest):", recordsData.emrHistory[0].diagnosis);
        console.log("EMR 2 (Older):", recordsData.emrHistory[1].diagnosis);
        
        if (recordsData.emrHistory[0].diagnosis === 'Step 27B Test Encounter 2') {
            console.log("Ordering: PASS (Newest first)");
        } else {
            console.error("Ordering: FAIL");
        }

        console.log("\n4. CROSS-PATIENT PROTECTION");
        if (patToken2) {
            const crossRes = await fetch(`${baseURL}/emr/records/${patient._id}`, {
                headers: { Authorization: `Bearer ${patToken2}` }
            });
            if (crossRes.status === 403) {
                console.log("Cross-patient: PASS (403 Forbidden)");
            } else {
                console.error("Cross-patient: FAIL with status", crossRes.status);
            }
        } else {
            console.log("Skipped: Need second patient user");
        }

        console.log("\n5. PATIENT INTEGRITY VERIFICATION (UNTAMPERED)");
        const ver1Res = await fetch(`${baseURL}/emr/${emr2Id}/verify`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        console.log("Verify EMR 2:", ver1Res.message);

        console.log("\n6. TAMPER EMR 2 in DB");
        await MedicalRecord.findByIdAndUpdate(emr2Id, { diagnosis: 'Tampered Diagnosis' });
        
        console.log("\n7. PATIENT INTEGRITY VERIFICATION (TAMPERED)");
        const ver2Res = await fetch(`${baseURL}/emr/${emr2Id}/verify`, {
            headers: { Authorization: `Bearer ${patToken}` }
        }).then(r => r.json());
        console.log("Verify EMR 2 (Tampered):", ver2Res.message);

        console.log("\n8. CLEANUP");
        await MedicalRecord.findByIdAndDelete(emr1Id);
        await MedicalRecord.findByIdAndDelete(emr2Id);
        console.log("Cleanup complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

testStep27B();
