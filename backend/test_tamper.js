const mongoose = require('mongoose');
const MedicalRecord = require('./models/MedicalRecord');
require('dotenv').config();

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    
    // Check args
    const action = process.argv[2];
    
    if (action === 'tamper') {
        const res = await MedicalRecord.updateOne(
            { _id: '6aaa8248e7cea5e4d4693b60' },
            { $set: { clinicalNotes: 'UNAUTHORIZED TAMPER TEST — MODIFIED VALUE' } }
        );
        console.log('Tamper Matched:', res.matchedCount, 'Modified:', res.modifiedCount);
    } else if (action === 'restore') {
        const res = await MedicalRecord.updateOne(
            { _id: '6aaa8248e7cea5e4d4693b60' },
            { $set: { clinicalNotes: 'Synthetic test EMR created for Phase 11 workflow validation.' } }
        );
        console.log('Restore Matched:', res.matchedCount, 'Modified:', res.modifiedCount);
    }
    
    await mongoose.disconnect();
}

run().catch(console.error);
