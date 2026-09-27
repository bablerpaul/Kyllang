const mongoose = require('mongoose');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const Certificate = require('./models/Certificate');

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    const files = await SecureFile.find({ linkedCertificate: { $exists: true, $ne: null } })
        .populate('linkedCertificate');
    console.log('--- READ-ONLY AUDIT: SECURE FILES WITH LINKED CERTIFICATE ---');
    for (const f of files) {
        console.log('SecureFile ID:', f._id.toString());
        console.log('Patient ID:', f.patient.toString());
        console.log('Filename:', f.fileName);
        console.log('linkedLabReport:', f.linkedLabReport || 'N/A');
        console.log('linkedEMR:', f.linkedEMR || 'N/A');
        console.log('linkedInsurance:', f.linkedInsurance || 'N/A');
        if (f.linkedCertificate) {
            console.log('Certificate _id:', f.linkedCertificate._id.toString());
            console.log('Certificate status:', f.linkedCertificate.status);
            console.log('Certificate patient:', f.linkedCertificate.patient.toString());
            console.log('Certificate validUntil:', f.linkedCertificate.validUntil);
        } else {
            console.log('Certificate is NULL (orphaned reference)');
        }
        console.log('-------------------------');
    }
    console.log('Total files found:', files.length);
    process.exit(0);
}).catch(console.error);
