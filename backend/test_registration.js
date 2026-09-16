const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function runTest() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/certificate-portal');
  
  // 1. Find an admin user
  const User = require('./models/User');
  const Doctor = require('./models/Doctor');
  let admin = await User.findOne({ role: 'hospital_admin' });
  if (!admin) {
    admin = await User.create({ name: 'Test Admin', email: 'admin@test.com', password: 'password', role: 'hospital_admin' });
  }

  // 2. Generate token
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'supersecretkey123', { expiresIn: '1h' });

  // 3. Send Request

  const payload = {
    name: 'Dr. Test Doctor',
    email: `testdoctor_${Date.now()}@example.com`,
    password: 'password123',
    role: 'doctor',
    specialty: 'Cardiology',
    contactNumber: '+1 555-0000',
    licenseNumber: `TEST-DOC-${Date.now()}`,
    department: 'Cardiology'
  };

  console.log('Sending request...');
  const res = await fetch('http://localhost:5000/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('API Response:', data);

  // 4. Verify MongoDB
  if (data.success) {
    const createdUser = await User.findById(data.data.user._id);
    const createdDoctor = await Doctor.findOne({ user: createdUser._id });
    
    console.log('--- VERIFICATION ---');
    console.log('User exists:', !!createdUser);
    console.log('User contactNumber:', createdUser.contactNumber);
    console.log('Doctor exists:', !!createdDoctor);
    if (createdDoctor) {
      console.log('Doctor licenseNumber:', createdDoctor.licenseNumber);
      console.log('Doctor department:', createdDoctor.department);
      console.log('Doctor specialty:', createdDoctor.specialty);
      console.log('Doctor consultationFee:', createdDoctor.consultationFee);
      
      // Cleanup test user
      await User.findByIdAndDelete(createdUser._id);
      await Doctor.findByIdAndDelete(createdDoctor._id);
      console.log('Cleanup successful.');
    }
  }
  
  mongoose.disconnect();
}

runTest().catch(console.error);
