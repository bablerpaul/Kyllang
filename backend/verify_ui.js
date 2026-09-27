const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const MedicalRecord = require('./models/MedicalRecord');
const Consent = require('./models/Consent');

async function verifyBooking() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    // Find the latest appointment
    const appts = await Appointment.find({ reason: /Routine consultation UI test/i }).sort({ _id: -1 }).limit(1);
    
    if (appts.length === 0) {
        console.log("FAIL: Could not find the appointment created by the user.");
        process.exit(1);
    }
    
    const appt = appts[0];
    console.log("Found Appointment:", appt._id);
    console.log("Status:", appt.status);
    console.log("Patient ID:", appt.patient);
    console.log("Doctor ID:", appt.doctor);
    
    const doctor = await Doctor.findById(appt.doctor);
    const patient = await Patient.findById(appt.patient);
    
    let docHasPatient = false;
    let patHasDoctor = false;
    
    if (doctor && doctor.assignedPatients) {
        docHasPatient = doctor.assignedPatients.some(id => id.toString() === patient._id.toString());
    }
    
    if (patient && patient.assignedDoctors) {
        patHasDoctor = patient.assignedDoctors.some(id => id.toString() === doctor._id.toString());
    }
    
    console.log("Doctor has Patient Assigned?", docHasPatient);
    console.log("Patient has Doctor Assigned?", patHasDoctor);
    
    // Check if any blockchain transactions were created since booking
    // This is hard to do without a before/after count, but we know MedicalRecords trigger it.
    
    // Cleanup the disposable appointment
    await Appointment.findByIdAndDelete(appt._id);
    console.log("Cleanup: Deleted disposable appointment", appt._id);
    
    process.exit(0);
}

verifyBooking();
