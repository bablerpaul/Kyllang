const mongoose = require('mongoose');
const Certificate = require('./models/Certificate');
const CertificateRequest = require('./models/CertificateRequest');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    
    const reqCount = await CertificateRequest.countDocuments();
    const certCount = await Certificate.countDocuments();
    const docCount = await Doctor.countDocuments();
    const patCount = await Patient.countDocuments();
    
    console.log('CertificateRequests:', reqCount);
    console.log('Certificates:', certCount);
    console.log('Doctors:', docCount);
    console.log('Patients:', patCount);
    
    process.exit(0);
}
main();
