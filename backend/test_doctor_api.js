const mongoose = require('mongoose');
const { createDoctorCertificateRequest } = require('./controllers/doctorController');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const User = require('./models/User');
const Consent = require('./models/Consent');
const DoctorCertificateRequest = require('./models/DoctorCertificateRequest');
require('dotenv').config();

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang');

    const doctorProfile = await Doctor.findOne().populate('user');
    if (!doctorProfile) process.exit(1);
    
    const doctorUser = await User.findById(doctorProfile.user._id);

    const patient = await Patient.findOne();
    const patientId = patient._id.toString();

    // Create a temporary consent
    const tempConsent = await Consent.create({
        patient: patient._id,
        patientUser: patient.user,
        grantedTo: doctorUser._id,
        grantedToRole: 'doctor',
        grantedToDoctor: doctorProfile._id,
        status: 'active',
        scope: 'full_access'
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

    console.log("--- TEST 5: Valid creation ---");
    let req = { body: { patientId, certificateType: 'general', reason: 'Test valid creation' }, user: doctorUser };
    let res = mockRes();
    await createDoctorCertificateRequest(req, res, console.error);
    console.log("Expected: 201. Got:", res.statusCode, res.data);

    if (res.statusCode === 201) {
        console.log("--- TEST 6: Duplicate request ---");
        let resDup = mockRes();
        await createDoctorCertificateRequest(req, resDup, console.error);
        console.log("Expected: 409. Got:", resDup.statusCode, resDup.data);
    }
    
    // Clean up
    await Consent.findByIdAndDelete(tempConsent._id);
    await DoctorCertificateRequest.deleteMany({ doctor: doctorProfile._id, patient: patient._id });

    process.exit(0);
}

runTests();
