const mongoose = require('mongoose');
const Doctor = require('./models/Doctor');

mongoose.connect('mongodb://localhost:27017/certificate-portal').then(async () => {
    const doctors = await Doctor.find().populate('user');
    console.log(JSON.stringify(doctors, null, 2));
    process.exit(0);
}).catch(console.error);
