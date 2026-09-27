const mongoose = require('mongoose');
const Patient = require('./models/Patient');
async function run() {
    await mongoose.connect('mongodb://localhost:27017/kyllang');
    
    // Patient user _id for Test Patient 1
    const userId = '6a9c38027543c3aa0742bee4';
    const patientDoc = await Patient.findOne({ $or: [{ _id: userId }, { user: userId }] });
    const pId = patientDoc ? patientDoc._id : userId;
    
    console.log('pId:', pId);
    console.log('userId:', userId);
    
    // Check if EMR exists for this patient
    const MedicalRecord = require('./models/MedicalRecord');
    const filter = { $or: [{ patient: pId }, { patient: userId }] };
    const emrs = await MedicalRecord.find(filter);
    console.log('Found EMRs count:', emrs.length);
    
    process.exit(0);
}
run();
