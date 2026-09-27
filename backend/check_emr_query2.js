const mongoose = require('mongoose');
const Patient = require('./models/Patient');
const MedicalRecord = require('./models/MedicalRecord');
async function run() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    const userId = '6a9c2ec0b8faba626c6f8bb1';
    const patientDoc = await Patient.findOne({ $or: [{ _id: userId }, { user: userId }] });
    const pId = patientDoc ? patientDoc._id : userId;
    
    console.log('pId:', pId);
    
    const filter = { $or: [{ patient: pId }, { patient: userId }] };
    console.log('filter:', JSON.stringify(filter));
    const emrs = await MedicalRecord.find(filter);
    console.log('Found EMRs count:', emrs.length);
    
    process.exit(0);
}
run();
