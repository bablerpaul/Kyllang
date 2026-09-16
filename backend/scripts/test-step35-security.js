const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Consent = require('../models/Consent');
const MedicalRecord = require('../models/MedicalRecord');
const PatientDocument = require('../models/PatientDocument');
const { hasActiveConsent } = require('../middlewares/consentMiddleware');

async function runTests() {
    console.log("=== Running Step 35 Security Tests ===");
    
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kyllang');
        console.log("Connected to MongoDB.\n");

        // Set up test users
        const dummyPassword = "password123";
        const doctorA_user = new User({ _id: new mongoose.Types.ObjectId(), name: "Dr. Alpha", email: "alpha@test.com", password: dummyPassword, role: "doctor" });
        const doctorA = new Doctor({ _id: new mongoose.Types.ObjectId(), user: doctorA_user._id, licenseNumber: "LIC123", specialty: "General" });

        const doctorB_user = new User({ _id: new mongoose.Types.ObjectId(), name: "Dr. Beta", email: "beta@test.com", password: dummyPassword, role: "doctor" });
        const doctorB = new Doctor({ _id: new mongoose.Types.ObjectId(), user: doctorB_user._id, licenseNumber: "LIC456", specialty: "General" });

        const patient1_user = new User({ _id: new mongoose.Types.ObjectId(), name: "Patient One", email: "p1@test.com", password: dummyPassword, role: "general_user" });
        const patient1 = new Patient({ _id: new mongoose.Types.ObjectId(), user: patient1_user._id, assignedDoctors: [doctorA._id], dateOfBirth: new Date() });

        const patient2_user = new User({ _id: new mongoose.Types.ObjectId(), name: "Patient Two", email: "p2@test.com", password: dummyPassword, role: "general_user" });
        const patient2 = new Patient({ _id: new mongoose.Types.ObjectId(), user: patient2_user._id, assignedDoctors: [], dateOfBirth: new Date() });

        const admin_user = new User({ _id: new mongoose.Types.ObjectId(), name: "Admin", email: "admin@test.com", password: dummyPassword, role: "hospital_admin" });

        const testEmails = ["alpha@test.com", "beta@test.com", "p1@test.com", "p2@test.com", "admin@test.com"];
        await User.deleteMany({ email: { $in: testEmails } });
        
        await Doctor.deleteMany({ licenseNumber: { $in: ["LIC123", "LIC456"] } });

        // Save them temporarily (we can also mock, but let's actually save to test query logic properly)
        await User.insertMany([doctorA_user, doctorB_user, patient1_user, patient2_user, admin_user]);
        await Doctor.insertMany([doctorA, doctorB]);
        await Patient.insertMany([patient1, patient2]);

        // Create a consent for Doctor A to Patient 2
        const consentDoc = new Consent({
            patient: patient2._id,
            patientUser: patient2_user._id,
            grantedTo: doctorA_user._id,
            grantedToRole: 'doctor',
            grantedToDoctor: doctorA._id,
            status: 'active',
            grantedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000)
        });
        await consentDoc.save();
        
        // Create a role-wide consent for Patient 2 (should NOT work anymore for random doctors like Doctor B)
        const roleConsentDoc = new Consent({
            patient: patient2._id,
            patientUser: patient2_user._id,
            grantedToRole: 'doctor',
            status: 'active',
            grantedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000)
        });
        await roleConsentDoc.save();

        let passCount = 0;
        let failCount = 0;

        const assert = (condition, message) => {
            if (condition) {
                console.log(`✅ PASS: ${message}`);
                passCount++;
            } else {
                console.error(`❌ FAIL: ${message}`);
                failCount++;
            }
        };

        // TESTS
        console.log("Running assertions...");

        // Test 1 & 3: Doctor A accessing Patient 1 (assigned)
        let res = await hasActiveConsent({ patientInput: patient1._id, requestingUser: doctorA_user });
        assert(res === true, "Doctor A can access Patient 1 (via assignment)");

        // Test 2 & 4: Doctor B accessing Patient 1 (NOT assigned, no consent)
        res = await hasActiveConsent({ patientInput: patient1._id, requestingUser: doctorB_user });
        assert(res === false, "Doctor B CANNOT access Patient 1 (no auth)");

        // Test 5 & 6: Doctor A accessing Patient 2 (has consent)
        res = await hasActiveConsent({ patientInput: patient2._id, requestingUser: doctorA_user });
        assert(res === true, "Doctor A can access Patient 2 (via explicit consent)");

        // Test: Doctor B accessing Patient 2 (role-wide consent should be ignored for Doctor B now)
        res = await hasActiveConsent({ patientInput: patient2._id, requestingUser: doctorB_user });
        assert(res === false, "Doctor B CANNOT piggyback on role-wide consent or Doctor A's consent for Patient 2");

        // Test 7: Patient 1 accessing own data
        res = await hasActiveConsent({ patientInput: patient1._id, requestingUser: patient1_user });
        assert(res === true, "Patient 1 can access own data");

        res = await hasActiveConsent({ patientInput: patient1._id, requestingUser: patient2_user });
        assert(res === false, "Patient 2 CANNOT access Patient 1's data");

        // Test 8: Admin accessing Patient 1
        res = await hasActiveConsent({ patientInput: patient1._id, requestingUser: admin_user });
        assert(res === true, "Admin can access Patient 1 data");


        console.log(`\nResults: ${passCount} Passed, ${failCount} Failed.`);

        // Cleanup
        await User.deleteMany({ _id: { $in: [doctorA_user._id, doctorB_user._id, patient1_user._id, patient2_user._id, admin_user._id] } });
        await Doctor.deleteMany({ _id: { $in: [doctorA._id, doctorB._id] } });
        await Patient.deleteMany({ _id: { $in: [patient1._id, patient2._id] } });
        await Consent.deleteMany({ _id: { $in: [consentDoc._id, roleConsentDoc._id] } });

        console.log("Cleanup complete.");
        process.exit(failCount > 0 ? 1 : 0);

    } catch (err) {
        console.error("Test Error:", err);
        process.exit(1);
    }
}

runTests();
