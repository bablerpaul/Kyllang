const mongoose = require('mongoose');
const { getDoctorCertificateRequests } = require('./controllers/patientController');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const DoctorCertificateRequest = require('./models/DoctorCertificateRequest');
require('dotenv').config();

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang');

    const patient = await Patient.findOne({ user: { $exists: true, $ne: null } });
    if (!patient) {
        console.log("No patient found. Exiting.");
        process.exit(1);
    }
    
    const doctor = await Doctor.findOne();
    if (!doctor) {
        console.log("No doctor found. Exiting.");
        process.exit(1);
    }

    // Insert a dummy request
    const dummyReq = await DoctorCertificateRequest.create({
        doctor: doctor._id,
        patient: patient._id,
        certificateType: 'general',
        reason: 'Testing GET API',
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

    console.log("--- TEST: Retrieve Requests ---");
    let req = { user: { _id: patient.user } };
    let res = mockRes();
    
    await getDoctorCertificateRequests(req, res, (err) => console.error("Error from next:", err));
    
    console.log("Expected: 200. Got:", res.statusCode);
    if (res.data) {
        console.log("Data count:", res.data.data.length);
        console.log("First request doctor info:", res.data.data[0].doctor);
    }
    
    // Clean up
    await DoctorCertificateRequest.findByIdAndDelete(dummyReq._id);
    process.exit(0);
}

runTests();
