const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const MedicalRecord = require('./models/MedicalRecord');
const { updateAppointmentStatus } = require('./src/modules/scheduling/appointmentController');
const { createEMR } = require('./src/modules/emr/emrRecordController');

async function runTests() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    const countsBefore = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments()
    };
    console.log('--- DATABASE BEFORE ---');
    console.log(countsBefore);

    const doctor = await Doctor.findOne().populate('user');
    const patient = await Patient.findOne().populate('user');
    const wrongDoctor = await Doctor.findOne({ _id: { $ne: doctor._id } }).populate('user');

    if (!doctor || !patient || !wrongDoctor) {
        console.log("Need at least 2 doctors and 1 patient in DB to test");
        process.exit(1);
    }

    // TEST 1
    const appt = new Appointment({
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: new Date(),
        timeSlot: "10:00 AM",
        status: "scheduled",
        reason: "Test T6-D2"
    });
    await appt.save();
    console.log("TEST 1 - Booked appointment. Status:", appt.status);

    // TEST 3
    let mockReq = {
        params: { id: appt._id.toString() },
        body: { status: 'confirmed' },
        user: wrongDoctor.user
    };
    let resStatus = null, resJson = null;
    let mockRes = {
        status: (s) => { resStatus = s; return mockRes; },
        json: (j) => { resJson = j; return mockRes; }
    };
    await updateAppointmentStatus(mockReq, mockRes, (err) => console.log(err));
    console.log("TEST 3 - Wrong doctor confirm result:", resStatus, resJson.message);

    // TEST 6
    let emrReq = {
        user: doctor.user,
        body: {
            patientId: patient._id.toString(),
            appointmentId: appt._id.toString(),
            diagnosis: "Test Diag"
        }
    };
    resStatus = null; resJson = null;
    await createEMR(emrReq, mockRes, (err) => {});
    console.log("TEST 6 - EMR before confirmation:", resStatus, resJson?.message);

    // TEST 2
    mockReq.user = doctor.user;
    resStatus = null; resJson = null;
    await updateAppointmentStatus(mockReq, mockRes, (err) => {});
    console.log("TEST 2 - Correct doctor confirm:", resStatus, resJson?.data?.status || 'Confirmed');

    const updatedDoc = await Doctor.findById(doctor._id);
    const updatedPat = await Patient.findById(patient._id);
    console.log("TEST 2 - Doctor has patient assigned:", updatedDoc.assignedPatients.includes(patient._id));
    console.log("TEST 2 - Patient has doctor assigned:", updatedPat.assignedDoctors.includes(doctor._id));

    // TEST 4
    resStatus = null; resJson = null;
    await updateAppointmentStatus(mockReq, mockRes, (err) => {});
    console.log("TEST 4 - Repeated confirmation:", resStatus, resJson?.message);

    // TEST 7
    emrReq.body = {
        patientId: patient._id.toString(),
        appointmentId: appt._id.toString(),
        diagnosis: "Test Diag",
        vitalSigns: { bloodPressure: "120/80", heartRate: 72, temperature: 98.6 },
        visitDate: new Date()
    };
    resStatus = null; resJson = null;
    await createEMR(emrReq, mockRes, (err) => { if(err) console.log(err) });
    console.log("TEST 7 - EMR after confirmation:", resStatus, resJson?.message || 'Success');

    // TEST 8
    emrReq.user = wrongDoctor.user;
    resStatus = null; resJson = null;
    await createEMR(emrReq, mockRes, (err) => {});
    console.log("TEST 8 - Unrelated doctor EMR:", resStatus, resJson?.message);

    // Cleanup
    await Appointment.findByIdAndDelete(appt._id);
    await MedicalRecord.findOneAndDelete({ diagnosis: "Test Diag" });
    await Doctor.findByIdAndUpdate(doctor._id, { $pull: { assignedPatients: patient._id } });
    await Patient.findByIdAndUpdate(patient._id, { $pull: { assignedDoctors: doctor._id } });
    await User.findByIdAndUpdate(doctor.user._id, { $pull: { assignedPatients: patient._id } });
    await User.findByIdAndUpdate(patient.user._id, { $pull: { assignedDoctors: doctor._id } });

    const countsAfter = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments()
    };
    console.log('--- DATABASE AFTER ---');
    console.log(countsAfter);
    
    process.exit(0);
}

runTests();
