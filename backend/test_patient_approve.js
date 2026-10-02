const mongoose = require('mongoose');
const { approveDoctorCertificateRequest } = require('./controllers/patientController');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const DoctorCertificateRequest = require('./models/DoctorCertificateRequest');
require('dotenv').config();

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang');

    const patients = await Patient.find({ user: { $exists: true, $ne: null } }).limit(2);
    if (patients.length < 2) {
        console.log("Need at least 2 patients. Exiting.");
        process.exit(1);
    }
    const patient1 = patients[0];
    const patient2 = patients[1];
    
    const doctor = await Doctor.findOne();
    
    // Insert a dummy request for patient1
    const dummyReq = await DoctorCertificateRequest.create({
        doctor: doctor._id,
        patient: patient1._id,
        certificateType: 'general',
        reason: 'Testing Approve API',
        status: 'pending'
    });

    const mockRes = () => {
        const res = {};
        res.status = (code) => {
            res.statusCode = code;
            return res;
        };
        res.json = (data) => {
            res.data = data;
            return res;
        };
        return res;
    };

    console.log("--- TEST: Malformed request ID ---");
    let req = { user: { _id: patient1.user }, params: { id: "invalid_id" } };
    let res = mockRes();
    await approveDoctorCertificateRequest(req, res, console.error);
    console.log("Expected: 400. Got:", res.statusCode);

    console.log("--- TEST: Nonexistent request ---");
    req = { user: { _id: patient1.user }, params: { id: new mongoose.Types.ObjectId().toString() } };
    res = mockRes();
    await approveDoctorCertificateRequest(req, res, console.error);
    console.log("Expected: 404. Got:", res.statusCode);

    console.log("--- TEST: Another Patient's request (IDOR) ---");
    req = { user: { _id: patient2.user }, params: { id: dummyReq._id.toString() } };
    res = mockRes();
    await approveDoctorCertificateRequest(req, res, console.error);
    console.log("Expected: 404. Got:", res.statusCode);
    
    console.log("--- TEST: Valid pending request ---");
    req = { user: { _id: patient1.user }, params: { id: dummyReq._id.toString() } };
    res = mockRes();
    await approveDoctorCertificateRequest(req, res, console.error);
    console.log("Expected: 200. Got:", res.statusCode);
    console.log("Status:", res.data?.request?.status);
    console.log("approvedAt:", res.data?.request?.approvedAt);
    console.log("doctor unchanged:", res.data?.request?.doctor.toString() === doctor._id.toString());
    console.log("patient unchanged:", res.data?.request?.patient.toString() === patient1._id.toString());
    
    // Check DB manually to ensure certificate and consumedAt are unset
    const updatedReq = await DoctorCertificateRequest.findById(dummyReq._id);
    console.log("certificate is unset:", updatedReq.certificate == null);
    console.log("consumedAt is unset:", updatedReq.consumedAt == null);

    console.log("--- TEST: Repeat approval ---");
    let reqRepeat = { user: { _id: patient1.user }, params: { id: dummyReq._id.toString() } };
    let resRepeat = mockRes();
    await approveDoctorCertificateRequest(reqRepeat, resRepeat, console.error);
    console.log("Expected: 409. Got:", resRepeat.statusCode);
    
    // Clean up
    await DoctorCertificateRequest.findByIdAndDelete(dummyReq._id);
    process.exit(0);
}

runTests();
