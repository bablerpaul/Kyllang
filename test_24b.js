const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config();

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang_health', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const User = require('./backend/models/User');
    const Doctor = require('./backend/models/Doctor');
    const Patient = require('./backend/models/Patient');
    const Appointment = require('./backend/models/Appointment');
    const MedicalRecord = require('./backend/models/MedicalRecord');

    // Find a doctor
    const docUser = await User.findOne({ role: 'doctor' });
    if (!docUser) throw new Error('No doctor found');
    const doctor = await Doctor.findOne({ user: docUser._id });

    // Generate token for doctor
    const token = jwt.sign({ id: docUser._id, role: docUser.role }, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' });

    // Find a patient
    const patUser = await User.findOne({ role: 'general_user' });
    let patient = await Patient.findOne({ user: patUser._id });
    if (!patient) {
      patient = await Patient.create({ user: patUser._id });
    }

    // Create a temporary appointment
    const apt = await Appointment.create({
      doctor: doctor._id,
      patient: patient._id,
      appointmentDate: new Date(),
      timeSlot: '10:00 AM',
      reason: 'Step24B Test',
      status: 'scheduled'
    });
    console.log('Created test appointment:', apt._id);

    // Call POST /api/emr
    const res = await axios.post('http://localhost:5000/api/emr', {
      appointmentId: apt._id,
      patientId: patient._id,
      diagnosis: 'Step24B Test Diagnosis',
      symptoms: ['Step24B Test Symptoms'],
      vitals: { bloodPressure: '120/80', heartRate: 75, temperature: 98.6 },
      clinicalNotes: 'Step24B test clinical encounter'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('EMR API Response:', res.status, res.data.success);
    const emrId = res.data.data.emr._id;
    console.log('Transaction Hash:', res.data.data.transactionHash);
    console.log('Data Hash:', res.data.data.dataHash);

    // Verify Patient Health Records
    // Need patient token
    const patToken = jwt.sign({ id: patUser._id, role: patUser.role }, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' });
    // First, give active consent
    await axios.post(`http://localhost:5000/api/consent/request`, {
      doctorId: doctor._id,
      accessLevel: 'full'
    }, { headers: { Authorization: `Bearer ${patToken}` } });
    
    // Now fetch
    const patRes = await axios.get(`http://localhost:5000/api/emr/patient/${patient._id}`, {
        headers: { Authorization: `Bearer ${patToken}` }
    });
    console.log('Patient Health Records Response:', patRes.status, patRes.data.data.length);
    const found = patRes.data.data.find(r => r._id.toString() === emrId.toString());
    console.log('Patient EMR found:', !!found);
    if (found) {
        console.log('Found EMR:', {
            patient: found.patient._id || found.patient,
            doctor: found.doctor._id || found.doctor,
            appointment: found.appointment,
            diagnosis: found.diagnosis,
            vitals: found.vitals || found.vitalSigns,
            dataHash: found.dataHash,
            transactionHash: found.transactionHash
        });
    }

    // Cleanup
    await MedicalRecord.findByIdAndDelete(emrId);
    await Appointment.findByIdAndDelete(apt._id);
    console.log('Cleaned up test data');

  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
