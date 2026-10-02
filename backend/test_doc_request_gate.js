const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const PatientDocument = require('./models/PatientDocument');
const User = require('./models/User');
const Consent = require('./models/Consent');
require('dotenv').config({ path: './.env' });

async function runTests() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // 1. Create a Patient
    const patientUser = await User.create({
        name: 'Test Doc Patient',
        email: `docpatient_${Date.now()}@test.com`,
        password: 'password123',
        role: 'general_user'
    });

    // 2. Create Authorized Doctor
    const authDoctor = await User.create({
        name: 'Auth Doctor',
        email: `authdoc_${Date.now()}@test.com`,
        password: 'password123',
        role: 'doctor'
    });

    // 3. Create Unauthorized Doctor
    const unauthDoctor = await User.create({
        name: 'Unauth Doctor',
        email: `unauthdoc_${Date.now()}@test.com`,
        password: 'password123',
        role: 'doctor'
    });

    // 4. Create Consent for Authorized Doctor
    const consent = await Consent.create({
        patient: patientUser._id,
        grantedTo: authDoctor._id,
        grantedToModel: 'User',
        grantedToRole: 'doctor',
        scope: 'full_access',
        status: 'active',
        expiresAt: new Date(Date.now() + 86400000) // 1 day
    });

    // 5. Create Patient Document
    const doc = await PatientDocument.create({
        patient: patientUser._id,
        title: 'Test Doc',
        type: 'other',
        encryptedData: 'test',
        patientEncryptedKey: 'test',
        accessRequests: []
    });

    const authToken = jwt.sign({ id: authDoctor._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const unauthToken = jwt.sign({ id: unauthDoctor._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    console.log('\n--- Test 1: Authorized Doctor ---');
    let res = await fetch(`http://127.0.0.1:5000/api/doctor/documents/${doc._id}/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Cookie': `token=${authToken}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' }
    });
    console.log('Auth Status:', res.status);
    let json = await res.json();
    console.log('Auth Body:', json);

    console.log('\n--- Test 3: Duplicate Request (Authorized) ---');
    res = await fetch(`http://127.0.0.1:5000/api/doctor/documents/${doc._id}/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Cookie': `token=${authToken}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' }
    });
    console.log('Dup Status:', res.status);
    json = await res.json();
    console.log('Dup Body:', json);

    console.log('\n--- Test 2: Unauthorized Doctor ---');
    res = await fetch(`http://127.0.0.1:5000/api/doctor/documents/${doc._id}/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${unauthToken}`, 'Cookie': `token=${unauthToken}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' }
    });
    console.log('Unauth Status:', res.status);
    json = await res.json();
    console.log('Unauth Body:', json);

    console.log('\n--- Test 4: Wrong/Unknown Document ---');
    const fakeId = new mongoose.Types.ObjectId();
    res = await fetch(`http://127.0.0.1:5000/api/doctor/documents/${fakeId}/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Cookie': `token=${authToken}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' }
    });
    console.log('Wrong Status:', res.status);
    json = await res.json();
    console.log('Wrong Body:', json);

    // Verify DB state
    const finalDoc = await PatientDocument.findById(doc._id);
    console.log('\nFinal accessRequests count:', finalDoc.accessRequests.length);

    // Cleanup
    await User.deleteMany({ _id: { $in: [patientUser._id, authDoctor._id, unauthDoctor._id] } });
    await Consent.deleteMany({ _id: consent._id });
    await PatientDocument.deleteMany({ _id: doc._id });

    mongoose.disconnect();
}
runTests().catch(console.error);
