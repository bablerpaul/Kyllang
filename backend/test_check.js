const mongoose = require('mongoose');
const DoctorCertificateRequest = require('./models/DoctorCertificateRequest');

async function testLock() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang_emr');
    let req = await DoctorCertificateRequest.create({ doctor: new mongoose.Types.ObjectId(), patient: new mongoose.Types.ObjectId(), certificateType: 'vaccine', status: 'approved', reason: 'Test lock' });
    
    console.log("Before lock:", req.lockedAt);
    
    const reserved = await DoctorCertificateRequest.findOneAndUpdate(
        { _id: req._id },
        { $set: { lockedAt: Date.now() } },
        { new: true }
    );
    
    console.log("After lock:", reserved.lockedAt);
    
    const fetch = await DoctorCertificateRequest.findById(req._id);
    console.log("Fetched lock:", fetch.lockedAt);
    
    await DoctorCertificateRequest.deleteMany({ reason: 'Test lock' });
    process.exit(0);
}
testLock();
