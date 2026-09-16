const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const MedicalRecord = require('c:/Users/Karthik/OneDrive/main project/project/backend/models/MedicalRecord');
const User = require('c:/Users/Karthik/OneDrive/main project/project/backend/models/User');

const API_URL = 'http://localhost:5000';

async function runTests() {
  await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
  console.log('Connected to DB');

  // 1. Get Admin Token
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin found');
  const token = jwt.sign({ id: admin._id }, 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });

  // 2. Get an EMR record
  const emr = await MedicalRecord.findOne({ dataHash: { $exists: true, $ne: null } });
  if (!emr) {
      console.log('No EMR found. Cannot run verification test. Create one first.');
      process.exit(1);
  }

  console.log(`\n--- TEST 1: NORMAL VERIFIED EMR ---`);
  let res = await fetch(`${API_URL}/api/emr/${emr._id}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
  });
  let data = await res.json();
  console.log('Status:', res.status, 'Response:', JSON.stringify(data, null, 2));

  console.log(`\n--- TEST 2: DATABASE DATA TAMPER DETECTION ---`);
  const originalDiagnosis = emr.diagnosis;
  await MedicalRecord.updateOne({ _id: emr._id }, { $set: { diagnosis: 'TAMPERED DIAGNOSIS' } });
  
  res = await fetch(`${API_URL}/api/emr/${emr._id}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
  });
  data = await res.json();
  console.log('Status:', res.status, 'Response:', JSON.stringify(data, null, 2));

  await MedicalRecord.updateOne({ _id: emr._id }, { $set: { diagnosis: originalDiagnosis } });

  console.log(`\n--- TEST 3: DATABASE HASH TAMPER DETECTION ---`);
  const originalHash = emr.dataHash;
  await MedicalRecord.updateOne({ _id: emr._id }, { $set: { dataHash: 'fake_tampered_hash_123' } });

  res = await fetch(`${API_URL}/api/emr/${emr._id}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
  });
  data = await res.json();
  console.log('Status:', res.status, 'Response:', JSON.stringify(data, null, 2));

  await MedicalRecord.updateOne({ _id: emr._id }, { $set: { dataHash: originalHash } });

  console.log(`\n--- TEST 5: AUTHORIZATION (UNAUTHENTICATED) ---`);
  res = await fetch(`${API_URL}/api/emr/${emr._id}/verify`);
  data = await res.json();
  console.log('Status:', res.status, 'Response:', JSON.stringify(data));

  mongoose.disconnect();
  console.log('\nTests completed.');
}

runTests().catch(err => {
    console.error(err);
    mongoose.disconnect();
    process.exit(1);
});
