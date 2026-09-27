const mongoose = require('mongoose');
const { InsuranceClaim, Consent, Patient, User, Certificate, MedicalRecord, Prescription } = require('./src/models');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    const claims = await InsuranceClaim.countDocuments();
    const files = await SecureFile.countDocuments();
    const versions = await FileVersion.countDocuments();
    const prescriptions = await Prescription.countDocuments();
    
    // I will check certificates by getting all and filtering
    const certs = await Certificate.find();
    const certRevoked = certs.find(c => c.verificationHash && c.verificationHash.endsWith('9303'));
    const certExpired = certs.find(c => c.verificationHash && c.verificationHash.endsWith('9314'));
    
    console.log('Claims:', claims);
    console.log('SecureFiles:', files);
    console.log('FileVersions:', versions);
    console.log('Prescriptions:', prescriptions);
    console.log('Cert 9303 Status:', certRevoked ? certRevoked.status : 'missing');
    console.log('Cert 9314 Status:', certExpired ? certExpired.status : 'missing');
    
    process.exit(0);
});
