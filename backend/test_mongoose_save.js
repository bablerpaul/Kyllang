const mongoose = require('mongoose');
const User = require('./models/User');

async function test() {
    try {
        await mongoose.connect('mongodb://localhost:27017/certificate-portal');
        console.log('Connected to MongoDB');

        const doctor = await User.findOne({ role: 'doctor' });
        const patient = await User.findOne({ role: 'general_user' });

        if (!doctor || !patient) {
            console.log('Ensure you have a doctor and a patient in DB');
            process.exit(1);
        }

        console.log('Found Doctor:', doctor.name);
        console.log('Found Patient:', patient.name);

        doctor.assignedPatients.push(patient._id);

        console.log('Attempting save...');
        await doctor.save();
        console.log('Save successful!');

    } catch (error) {
        console.error('Mongoose Save Error:', error);
        if (error.stack) console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

test();
