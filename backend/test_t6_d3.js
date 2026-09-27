const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const MedicalRecord = require('./models/MedicalRecord');
const Consent = require('./models/Consent');
const { updateAppointmentStatus } = require('./src/modules/scheduling/appointmentController');
const { createEMR, getPatientEMRs, deleteEMR } = require('./src/modules/emr/emrRecordController');

async function runTests() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    const countsBefore = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments(),
        Consents: await Consent.countDocuments()
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

    // Force clean state
    await Doctor.findByIdAndUpdate(doctor._id, { $pull: { assignedPatients: patient._id } });
    await Patient.findByIdAndUpdate(patient._id, { $pull: { assignedDoctors: doctor._id } });
    if(doctor.user) await User.findByIdAndUpdate(doctor.user._id, { $pull: { assignedPatients: patient._id } });
    if(patient.user) await User.findByIdAndUpdate(patient.user._id, { $pull: { assignedDoctors: doctor._id } });

    // Helper for making req/res objects
    const makeRes = (cb) => {
        let resStatus = null, resJson = null;
        return {
            res: {
                status: (s) => { resStatus = s; return { json: (j) => { resJson = j; cb(resStatus, resJson); } }; },
                json: (j) => { resJson = j; cb(200, resJson); }
            }
        };
    };

    // --- TEST 1: Before confirmation ---
    const appt = new Appointment({
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: new Date(),
        timeSlot: "10:00 AM",
        status: "scheduled",
        reason: "Test T6-D3"
    });
    await appt.save();

    let emrReq = {
        user: doctor.user,
        body: {
            patientId: patient._id.toString(),
            appointmentId: appt._id.toString(),
            diagnosis: "Test Diag",
            visitDate: new Date(),
            vitalSigns: { bloodPressure: "120/80", heartRate: 72, temperature: 98.6 }
        },
        query: {
            patientId: patient._id.toString()
        },
        params: {
            patientId: patient._id.toString()
        }
    };
    
    let t1Create, t1Read;
    await createEMR(emrReq, makeRes((s, j) => { t1Create = s; }).res, () => {});
    await getPatientEMRs(emrReq, makeRes((s, j) => { t1Read = s; }).res, () => {});
    console.log("TEST 1 - Before confirmation (Create):", t1Create === 403 ? "PASS" : "FAIL", t1Create);
    console.log("TEST 1 - Before confirmation (Read):", t1Read === 403 ? "PASS" : "FAIL", t1Read);

    // --- TEST 2: After confirmation ---
    let confirmReq = {
        params: { id: appt._id.toString() },
        body: { status: 'confirmed' },
        user: doctor.user
    };
    await updateAppointmentStatus(confirmReq, makeRes(()=>{}).res, () => {});
    
    const updatedDoc = await Doctor.findById(doctor._id);
    const assignmentExists = updatedDoc.assignedPatients.includes(patient._id);
    
    let t2Create, t2Read;
    await createEMR(emrReq, makeRes((s, j) => { t2Create = s; }).res, () => {});
    await getPatientEMRs(emrReq, makeRes((s, j) => { t2Read = s; }).res, () => {});
    console.log("TEST 2 - After confirmation (Assignment exists):", assignmentExists ? "PASS" : "FAIL");
    console.log("TEST 2 - After confirmation (Create):", t2Create === 201 ? "PASS" : "FAIL", t2Create);
    console.log("TEST 2 - After confirmation (Read):", t2Read === 200 ? "PASS" : "FAIL", t2Read);

    // --- TEST 3: Unrelated Doctor ---
    emrReq.user = wrongDoctor.user;
    let t3Create, t3Read;
    await createEMR(emrReq, makeRes((s, j) => { t3Create = s; }).res, () => {});
    await getPatientEMRs(emrReq, makeRes((s, j) => { t3Read = s; }).res, () => {});
    console.log("TEST 3 - Unrelated Doctor (Create):", t3Create === 403 ? "PASS" : "FAIL", t3Create);
    console.log("TEST 3 - Unrelated Doctor (Read):", t3Read === 403 ? "PASS" : "FAIL", t3Read);

    // --- TEST 4: Appointment without assignment ---
    const appt2 = new Appointment({
        patient: patient._id,
        doctor: wrongDoctor._id,
        appointmentDate: new Date(),
        timeSlot: "11:00 AM",
        status: "scheduled",
        reason: "Test T6-D3 Appt 2"
    });
    await appt2.save();
    
    let t4Read;
    await getPatientEMRs(emrReq, makeRes((s, j) => { t4Read = s; }).res, () => {});
    console.log("TEST 4 - Scheduled Appointment (Read):", t4Read === 403 ? "PASS" : "FAIL", t4Read);

    // --- TEST 5: Consent regression ---
    // Let's create an active consent for wrongDoctor
    const consent = new Consent({
        patient: patient._id,
        grantedTo: wrongDoctor.user._id,
        grantedToRole: 'doctor',
        status: 'active',
        scopes: ['medical_records']
    });
    await consent.save();
    
    let t5Read;
    await getPatientEMRs(emrReq, makeRes((s, j) => { t5Read = s; }).res, () => {});
    console.log("TEST 5 - Consent regression (Read):", t5Read === 200 ? "PASS" : "FAIL", t5Read);

    // --- TEST 7: Confirmation integrity ---
    let confirmReqWrong = {
        params: { id: appt2._id.toString() },
        body: { status: 'confirmed' },
        user: doctor.user
    };
    let t7Confirm;
    await updateAppointmentStatus(confirmReqWrong, makeRes((s, j) => { t7Confirm = s; }).res, () => {});
    console.log("TEST 7 - Confirmation Integrity (Wrong doc confirming):", t7Confirm === 403 ? "PASS" : "FAIL", t7Confirm);

    // Cleanup
    await Appointment.findByIdAndDelete(appt._id);
    await Appointment.findByIdAndDelete(appt2._id);
    await MedicalRecord.deleteMany({ diagnosis: "Test Diag" });
    await Consent.findByIdAndDelete(consent._id);
    await Doctor.findByIdAndUpdate(doctor._id, { $pull: { assignedPatients: patient._id } });
    await Patient.findByIdAndUpdate(patient._id, { $pull: { assignedDoctors: doctor._id } });
    if(doctor.user) await User.findByIdAndUpdate(doctor.user._id, { $pull: { assignedPatients: patient._id } });
    if(patient.user) await User.findByIdAndUpdate(patient.user._id, { $pull: { assignedDoctors: doctor._id } });

    const countsAfter = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments(),
        Consents: await Consent.countDocuments()
    };
    console.log('--- DATABASE AFTER ---');
    console.log(countsAfter);
    
    process.exit(0);
}

runTests();
