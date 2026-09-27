const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const MedicalRecord = require('./models/MedicalRecord');
const Consent = require('./models/Consent');
const Prescription = require('./models/Prescription');
const LabReport = require('./models/LabReport');
const { updateAppointmentStatus } = require('./src/modules/scheduling/appointmentController');
const { getPatientEMRs, createEMR, updateEMR, deleteEMR, getEMRById } = require('./src/modules/emr/emrRecordController');

async function runTests() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    const countsBefore = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        Appointments: await Appointment.countDocuments(),
        MedicalRecords: await MedicalRecord.countDocuments(),
        Consents: await Consent.countDocuments(),
        Prescriptions: await Prescription.countDocuments(),
        LabReports: await LabReport.countDocuments()
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

    const makeRes = (cb) => {
        let resStatus = null, resJson = null;
        return {
            res: {
                status: (s) => { resStatus = s; return { json: (j) => { resJson = j; cb(resStatus, resJson); } }; },
                json: (j) => { resJson = j; cb(200, resJson); }
            }
        };
    };

    // --- TEST 1: Booking ---
    const appt = new Appointment({
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: new Date(),
        timeSlot: "10:00 AM",
        status: "scheduled",
        reason: "Test T6-D4"
    });
    await appt.save();
    console.log("TEST 1 - Booked appointment. Status:", appt.status);

    let emrReq = {
        user: doctor.user,
        body: {
            patientId: patient._id.toString(),
            appointmentId: appt._id.toString(),
            diagnosis: "Test Diag",
            visitDate: new Date(),
            vitalSigns: { bloodPressure: "120/80", heartRate: 72, temperature: 98.6 }
        },
        query: { patientId: patient._id.toString() },
        params: { patientId: patient._id.toString() }
    };
    
    // --- TEST 2: Pre-confirmation EMR ---
    let t2Create, t2Read;
    await createEMR(emrReq, makeRes((s, j) => { t2Create = s; }).res, () => {});
    await getPatientEMRs(emrReq, makeRes((s, j) => { t2Read = s; }).res, () => {});
    console.log("TEST 2 - Pre-confirmation (Create):", t2Create === 403 ? "PASS" : "FAIL", t2Create);
    console.log("TEST 2 - Pre-confirmation (Read):", t2Read === 403 ? "PASS" : "FAIL", t2Read);

    // --- TEST 3: Correct Confirmation ---
    let confirmReq = {
        params: { id: appt._id.toString() },
        body: { status: 'confirmed' },
        user: doctor.user
    };
    await updateAppointmentStatus(confirmReq, makeRes(()=>{}).res, () => {});
    
    const updatedDoc = await Doctor.findById(doctor._id);
    const assignmentExists = updatedDoc.assignedPatients.includes(patient._id);
    console.log("TEST 3 - Correct confirmation assignment exists:", assignmentExists ? "PASS" : "FAIL");

    // --- TEST 4: Wrong Doctor Confirmation ---
    const apptWrong = new Appointment({
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: new Date(),
        timeSlot: "11:00 AM",
        status: "scheduled",
        reason: "Test T6-D4 ApptWrong"
    });
    await apptWrong.save();
    let confirmReqWrong = {
        params: { id: apptWrong._id.toString() },
        body: { status: 'confirmed' },
        user: wrongDoctor.user
    };
    let t4Confirm;
    await updateAppointmentStatus(confirmReqWrong, makeRes((s) => { t4Confirm = s; }).res, () => {});
    console.log("TEST 4 - Wrong Doctor Confirm:", t4Confirm === 403 ? "PASS" : "FAIL", t4Confirm);

    // --- TEST 5: Assigned Doctor Create EMR ---
    let t5Create, emrId;
    await createEMR(emrReq, makeRes((s, j) => { 
        t5Create = s; 
        if (s === 201 && j.data && j.data._id) emrId = j.data._id;
    }).res, () => {});
    if(!emrId) {
        const created = await MedicalRecord.findOne({ diagnosis: "Test Diag" });
        if(created) emrId = created._id;
    }
    console.log("TEST 5 - Create EMR:", t5Create === 201 ? "PASS" : "FAIL", t5Create);

    // --- TEST 6: Assigned Doctor Read EMR ---
    let t6ReadList, t6ReadOne;
    await getPatientEMRs(emrReq, makeRes((s, j) => { t6ReadList = s; }).res, () => {});
    emrReq.params.id = emrId?.toString();
    await getEMRById(emrReq, makeRes((s, j) => { t6ReadOne = s; }).res, () => {});
    console.log("TEST 6 - Read EMR list:", t6ReadList === 200 ? "PASS" : "FAIL", t6ReadList);
    console.log("TEST 6 - Read EMR one:", t6ReadOne === 200 ? "PASS" : "FAIL", t6ReadOne);

    // --- TEST 7: Assigned Doctor Update EMR ---
    emrReq.body.diagnosis = "Test Diag Updated";
    let t7Update;
    await updateEMR(emrReq, makeRes((s, j) => { t7Update = s; }).res, () => {});
    console.log("TEST 7 - Update EMR:", t7Update === 200 ? "PASS" : "FAIL", t7Update);

    // --- TEST 9: Unrelated Doctor ---
    emrReq.user = wrongDoctor.user;
    let t9Create, t9Read, t9Update, t9Delete;
    await createEMR(emrReq, makeRes((s, j) => { t9Create = s; }).res, () => {});
    await getPatientEMRs(emrReq, makeRes((s, j) => { t9Read = s; }).res, () => {});
    await updateEMR(emrReq, makeRes((s, j) => { t9Update = s; }).res, () => {});
    await deleteEMR(emrReq, makeRes((s, j) => { t9Delete = s; }).res, () => {});
    console.log("TEST 9 - Unrelated Create:", t9Create === 403 ? "PASS" : "FAIL", t9Create);
    console.log("TEST 9 - Unrelated Read:", t9Read === 403 ? "PASS" : "FAIL", t9Read);
    console.log("TEST 9 - Unrelated Update:", t9Update === 403 ? "PASS" : "FAIL", t9Update);
    console.log("TEST 9 - Unrelated Delete:", t9Delete === 403 ? "PASS" : "FAIL", t9Delete);

    // --- TEST 10: Consent Regression ---
    const consent = new Consent({
        patient: patient._id,
        grantedTo: wrongDoctor.user._id,
        grantedToRole: 'doctor',
        status: 'active',
        scopes: ['medical_records']
    });
    await consent.save();
    let t10Read;
    await getPatientEMRs(emrReq, makeRes((s, j) => { t10Read = s; }).res, () => {});
    console.log("TEST 10 - Consent Read:", t10Read === 200 ? "PASS" : "FAIL", t10Read);

    // --- TEST 8: Assigned Doctor Delete EMR ---
    emrReq.user = doctor.user;
    let t8Delete;
    await deleteEMR(emrReq, makeRes((s, j) => { t8Delete = s; }).res, () => {});
    console.log("TEST 8 - Delete EMR:", t8Delete === 200 ? "PASS" : "FAIL", t8Delete);

    // --- TEST 11: Repeated Confirmation ---
    let t11Confirm;
    await updateAppointmentStatus(confirmReq, makeRes((s) => { t11Confirm = s; }).res, (err) => {
        if(err) console.log("TEST 11 NEXT ERR:", err);
    });
    console.log("TEST 11 - Repeated Confirm:", t11Confirm === 400 || t11Confirm === 200 ? "PASS" : "FAIL", t11Confirm); // might be 400 Only scheduled apps can be confirmed

    // --- TEST 12: Cancellation Regression ---
    const apptCancel = new Appointment({
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: new Date(),
        timeSlot: "12:00 PM",
        status: "scheduled",
        reason: "Test T6-D4 ApptCancel"
    });
    await apptCancel.save();
    let cancelReq = {
        params: { id: apptCancel._id.toString() },
        body: { status: 'cancelled' },
        user: doctor.user
    };
    await updateAppointmentStatus(cancelReq, makeRes(()=>{}).res, () => {});
    const apptCancelCheck = await Appointment.findById(apptCancel._id);
    console.log("TEST 12 - Cancellation:", apptCancelCheck.status === 'cancelled' ? "PASS" : "FAIL", apptCancelCheck.status);

    // Cleanup
    await Appointment.findByIdAndDelete(appt._id);
    await Appointment.findByIdAndDelete(apptWrong._id);
    await Appointment.findByIdAndDelete(apptCancel._id);
    await MedicalRecord.deleteMany({ diagnosis: { $regex: /Test Diag/i } });
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
        Consents: await Consent.countDocuments(),
        Prescriptions: await Prescription.countDocuments(),
        LabReports: await LabReport.countDocuments()
    };
    console.log('--- DATABASE AFTER ---');
    console.log(countsAfter);
    
    process.exit(0);
}

runTests();
