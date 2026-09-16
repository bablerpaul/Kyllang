const mongoose = require('mongoose');
const User = require('./models/User');
const Patient = require('./models/Patient');
const jwt = require('jsonwebtoken');

async function seedTxs() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    console.log("Connected to MongoDB.");

    const doctorUser = await User.findOne({ role: 'doctor' });
    const patientUser = await User.findOne({ role: 'general_user' });

    if (!doctorUser || !patientUser) {
        console.error("Missing test users");
        process.exit(1);
    }

    const patient = await Patient.findOne({ user: patientUser._id });
    const docToken = jwt.sign({ id: doctorUser._id, role: 'doctor' }, process.env.JWT_SECRET || 'SUPER_SECRET_JWT_KEY_12345_FOR_LOCAL_DEV', { expiresIn: '1h' });

    for (let i = 0; i < 15; i++) {
        console.log(`Creating EMR ${i+1}/15...`);
        const emrData = {
            patientId: patient._id.toString(),
            diagnosis: `Journal Test Diagnosis ${i+1}`,
            symptoms: ['Cough', 'Fever'],
            clinicalNotes: `Routine checkup ${i+1}`,
            visitDate: new Date().toISOString()
        };

        const res = await fetch('http://localhost:5000/api/emr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
            body: JSON.stringify(emrData)
        }).then(r => r.json());
        
        console.log("Result:", res.success ? "Success" : "Failed", res.message || "");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("Done.");
    process.exit(0);
}

seedTxs().catch(console.error);
