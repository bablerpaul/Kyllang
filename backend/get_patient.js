const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kyllang')
  .then(async () => {
    require('./models/Patient');
    const MedicalRecord = require('./models/MedicalRecord');
    const record = await MedicalRecord.findOne().populate('patient', 'name email');
    if (record) {
      console.log('VALID PATIENT ID FOR TEST:', record.patient._id.toString());
      console.log('PATIENT NAME:', record.patient.name);
    } else {
      console.log('No medical records found to break-glass into.');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
