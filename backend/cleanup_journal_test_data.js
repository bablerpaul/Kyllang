const mongoose = require('mongoose');

async function cleanup() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
        console.log("Connected to MongoDB.");

        const MedicalRecord = require('./models/MedicalRecord'); 

        const query = { diagnosis: { $regex: /^Journal Test Diagnosis/ } };
        
        const beforeCount = await MedicalRecord.countDocuments(query);
        console.log(`Before count: ${beforeCount}`);

        const result = await MedicalRecord.deleteMany(query);
        console.log(`Deleted count: ${result.deletedCount}`);

        const afterCount = await MedicalRecord.countDocuments(query);
        console.log(`After count: ${afterCount}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

cleanup();
