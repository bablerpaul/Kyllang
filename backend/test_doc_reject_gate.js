const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const PatientDocument = require('./models/PatientDocument');
const User = require('./models/User');
require('dotenv').config({ path: './.env' });

async function runTests() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // 1. Create Patient 1
    const patient1 = await User.create({
        name: 'Patient 1', email: `p1_${Date.now()}@test.com`, password: 'password123', role: 'general_user'
    });

    // 2. Create Patient 2 (Unauthorized)
    const patient2 = await User.create({
        name: 'Patient 2', email: `p2_${Date.now()}@test.com`, password: 'password123', role: 'general_user'
    });

    // 3. Create Doctor 1 (To be rejected)
    const doctor1 = await User.create({
        name: 'Dr 1', email: `d1_${Date.now()}@test.com`, password: 'password123', role: 'doctor'
    });

    // 4. Create Doctor 2 (Already approved)
    const doctor2 = await User.create({
        name: 'Dr 2', email: `d2_${Date.now()}@test.com`, password: 'password123', role: 'doctor'
    });

    // 5. Create Patient Document for Patient 1
    const doc = await PatientDocument.create({
        patient: patient1._id,
        title: 'Test Doc',
        type: 'other',
        encryptedData: 'test',
        patientEncryptedKey: 'test',
        accessRequests: [{ doctor: doctor1._id }],
        accessList: [{ doctor: doctor2._id, doctorEncryptedKey: 'enc', expiresAt: new Date(Date.now() + 86400000) }]
    });

    const p1Token = jwt.sign({ id: patient1._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const p2Token = jwt.sign({ id: patient2._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    console.log('\n--- Test 2: Unauthorized patient attempts rejection ---');
    let res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${doc._id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p2Token}`, 'Cookie': `token=${p2Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor1._id })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    console.log('\n--- Test 4: Reject already-approved doctor ---');
    res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${doc._id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Token}`, 'Cookie': `token=${p1Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor2._id })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    console.log('\n--- Test 1: Patient rejects legitimate pending request ---');
    res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${doc._id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Token}`, 'Cookie': `token=${p1Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor1._id })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    console.log('\n--- Test 5: Repeat rejection ---');
    res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${doc._id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Token}`, 'Cookie': `token=${p1Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor1._id })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    console.log('\n--- Test 3: Reject nonexistent request ---');
    const fakeDocId = new mongoose.Types.ObjectId();
    res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${fakeDocId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Token}`, 'Cookie': `token=${p1Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor1._id })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    console.log('\n--- Test 6: Approval regression (structural) ---');
    // We add a new request to approve
    doc.accessRequests.push({ doctor: doctor1._id });
    await doc.save();
    res = await fetch(`http://127.0.0.1:5000/api/patient/documents/${doc._id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Token}`, 'Cookie': `token=${p1Token}`, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({ doctorId: doctor1._id, doctorEncryptedKey: 'new_enc_key' })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.json());

    const finalDoc = await PatientDocument.findById(doc._id);
    console.log('\nFinal accessRequests count:', finalDoc.accessRequests.length);
    console.log('Final accessList count:', finalDoc.accessList.length);
    
    const approvedDoc1 = finalDoc.accessList.find(a => a.doctor.toString() === doctor1._id.toString());
    console.log('Dr 1 is in accessList:', !!approvedDoc1);
    
    const approvedDoc2 = finalDoc.accessList.find(a => a.doctor.toString() === doctor2._id.toString());
    console.log('Dr 2 is in accessList:', !!approvedDoc2);

    await User.deleteMany({ _id: { $in: [patient1._id, patient2._id, doctor1._id, doctor2._id] } });
    await PatientDocument.deleteMany({ _id: doc._id });

    mongoose.disconnect();
}

runTests().catch(console.error);
