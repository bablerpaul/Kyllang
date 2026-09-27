const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
async function run() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    // 1. Delete the confirmed appointment
    const apptId = '6ab3c0fb9b97cb38f573fc94';
    await Appointment.findByIdAndDelete(apptId);
    console.log('Deleted appointment', apptId);
    
    // 2. Remove the temporary assignments
    const doctorId = '6a9c2ec0b8faba626c6f8bb0';
    const patientId = '6a9c38027543c3aa0742bee5';
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
        MedicalRecords: await require('./models/MedicalRecord').countDocuments(),
        Consents: await require('./models/Consent').countDocuments()
    };
    console.log('FINAL COUNTS:', counts);
    
    process.exit(0);
}
run();
