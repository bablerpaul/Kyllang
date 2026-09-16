const mongoose = require('mongoose');
const axios = require('axios');
const http = require('http');

// Use testing environment
process.env.TEST_MODE = 'true';
process.env.MONGO_URI = 'mongodb://localhost:27017/kyllang_regression_test';
process.env.PORT = '5005';

const app = require('../index');
const PORT = process.env.PORT;

const API_URL = `http://localhost:${PORT}/api`;

let server;

async function runTests() {
    console.log('--- STARTING REGRESSION TESTS ---\n');

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`Server running on port ${PORT}`);

    // Wait for DB to connect
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Clear test DB
    await mongoose.connection.dropDatabase();

    let patientToken, doctorToken;
    let patientId, doctorId;
    let emrId, certId, consentId;

    try {
        // 1. Patient Registration & Login
        console.log('[TEST] Patient Registration...');
        const patientData = {
            name: 'Test Patient',
            email: `patient_${Date.now()}@test.com`,
            password: 'Password123!',
            role: 'general_user',
            dateOfBirth: '1990-01-01',
            contactNumber: '1234567890'
        };
        const regRes = await axios.post(`${API_URL}/auth/register`, patientData);
        if (regRes.data.success) console.log('✅ Patient registered');
        else throw new Error('Patient registration failed');

        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: patientData.email,
            password: patientData.password
        });
        patientToken = loginRes.data.data.token;
        patientId = loginRes.data.data._id;
        console.log('✅ Patient logged in');

        // 2. Doctor Registration & Login
        console.log('[TEST] Doctor Registration...');
        const doctorData = {
            name: 'Dr. Smith',
            email: `doctor_${Date.now()}@test.com`,
            password: 'Password123!',
            role: 'doctor',
            specialty: 'Cardiology',
            licenseNumber: `LIC${Date.now()}`
        };
        const docRegRes = await axios.post(`${API_URL}/auth/register`, doctorData);
        const docLoginRes = await axios.post(`${API_URL}/auth/login`, {
            email: doctorData.email,
            password: doctorData.password
        });
        doctorToken = docLoginRes.data.data.token;
        doctorId = docLoginRes.data.data._id;
        console.log('✅ Doctor registered and logged in');

        // 3. Patient Consent (Grant to doctor)
        console.log('[TEST] Patient Consent...');
        const consentRes = await axios.post(`${API_URL}/consent/grant-doctor`, {
            doctorId: doctorId,
            scope: 'full_access',
            purpose: 'General checkup',
            durationDays: 30
        }, { headers: { Authorization: `Bearer ${patientToken}` } });
        consentId = consentRes.data.data._id;
        console.log('✅ Consent granted');

        // 4. EMR Creation (Doctor creating for Patient)
        console.log('[TEST] EMR Creation...');
        const emrRes = await axios.post(`${API_URL}/emr`, {
            patient: patientId,
            diagnosis: 'Healthy',
            symptoms: ['None'],
            treatmentPlan: 'Maintain diet'
        }, { headers: { Authorization: `Bearer ${doctorToken}` } });
        emrId = emrRes.data.data.emr._id;
        console.log('✅ EMR created');

        // 5. EMR Viewing
        console.log('[TEST] EMR Viewing...');
        const getEmrRes = await axios.get(`${API_URL}/emr/${emrId}`, {
            headers: { Authorization: `Bearer ${doctorToken}` }
        });
        if (getEmrRes.data.data.diagnosis === 'Healthy') {
            console.log('✅ EMR viewed successfully');
        } else throw new Error('EMR data mismatch');

        // 6. Medical Certificate Generation
        console.log('[TEST] Certificate Generation...');
        const validFrom = new Date().toISOString();
        const validUntil = new Date(Date.now() + 86400000).toISOString();
        const certRes = await axios.post(`${API_URL}/certificates`, {
            patientId: patientId,
            emrRecordId: emrId,
            diagnosis: 'Healthy',
            validFrom,
            validUntil
        }, { headers: { Authorization: `Bearer ${doctorToken}` } });
        certId = certRes.data.data._id;
        const certHash = certRes.data.data.verificationHash;
        console.log('✅ Certificate generated');

        // 7. Certificate Verification
        console.log('[TEST] Certificate Verification...');
        const verifyRes = await axios.post(`${API_URL}/certificates/verify`, {
            hash: certHash,
            data: {
                patientId,
                diagnosis: 'Healthy',
                validFrom,
                validUntil
            }
        });
        if (verifyRes.data.success) {
            console.log('✅ Certificate verified');
        } else throw new Error('Certificate verification failed');

        console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.response ? JSON.stringify(err.response.data) : err.message);
    } finally {
        // Shutdown
        await mongoose.connection.close();
        server.close();
        process.exit(0);
    }
}

runTests();
