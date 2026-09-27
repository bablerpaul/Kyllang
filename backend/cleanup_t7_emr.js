const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const MedicalRecord = require('./models/MedicalRecord');
const Consent = require('./models/Consent');

async function run() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    // Find the latest EMR
    const emr = await MedicalRecord.findOne().sort({ _id: -1 });
    console.log('EMR Created:', emr._id);
    console.log('Patient:', emr.patient);
    console.log('Doctor:', emr.doctor);
    console.log('Diagnosis:', emr.diagnosis);
    console.log('Blockchain Hash:', emr.blockchainHash);
    
    // Consents
    const consents = await Consent.countDocuments();
    console.log('Consents Total:', consents);
    
    // 1. Delete the EMR
    await MedicalRecord.findByIdAndDelete(emr._id);
    console.log('Deleted EMR', emr._id);
    
    // 2. Delete the Appointment
    const apptId = emr.appointment;
    await Appointment.findByIdAndDelete(apptId);
    console.log('Deleted appointment', apptId);
    
    // 3. Remove the temporary assignments
    const doctorId = emr.doctor;
    const patientId = emr.patient;
    const patUser = await User.findOne({ _id: (await Patient.findById(patientId)).user });
    
    await Doctor.findByIdAndUpdate(doctorId, { $pull: { assignedPatients: patientId } });
    await Patient.findByIdAndUpdate(patientId, { $pull: { assignedDoctors: doctorId } });
    await User.findByIdAndUpdate(patUser._id, { $pull: { assignedDoctors: doctorId } });
    
    console.log('Cleaned up assignments.');
    
    const counts = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments(),
        Consents: await Consent.countDocuments()
    };
    console.log('FINAL COUNTS:', counts);
    
    process.exit(0);
}
run();
