const mongoose = require('mongoose');
const crypto = require('crypto');
const Certificate = require('./models/Certificate');
const fs = require('fs');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal');
    const cert = await Certificate.findOne().sort({ createdAt: -1 });
    if (!cert) {
        fs.writeFileSync('out.txt', 'No certs found');
        process.exit(0);
    }

    let out = `Latest cert:
ID: ${cert._id}
Patient: ${cert.patient}
Diagnosis: ${cert.diagnosis}
ValidFrom: ${cert.validFrom}
ValidUntil: ${cert.validUntil}
Hash: ${cert.verificationHash}
`;

    // The doctorController logic:
    // JSON.stringify({ patientId, diagnosis, validFrom, validUntil })
    // What exact strings were stored?
    // Let's test different formats
    const tests = [
        { patientId: cert.patient.toString(), diagnosis: cert.diagnosis, validFrom: cert.validFrom, validUntil: cert.validUntil },
        { patientId: cert.patient.toString(), diagnosis: cert.diagnosis, validFrom: cert.validFrom.toISOString(), validUntil: cert.validUntil.toISOString() },
        { patientId: cert.patient.toString(), diagnosis: cert.diagnosis, validFrom: cert.validFrom.toISOString().split('T')[0], validUntil: cert.validUntil.toISOString().split('T')[0] },
    ];

    const secret = process.env.JWT_SECRET || 'supersecretkey123';

    tests.forEach((t, i) => {
        const hashData = JSON.stringify(t);
        const expectedHash = crypto.createHmac('sha256', secret).update(hashData).digest('hex');
        out += `\nTest ${i} hashData: ${hashData}\n`;
        out += `Test ${i} hash: ${expectedHash} (${expectedHash === cert.verificationHash ? 'MATCH' : 'MISMATCH'})\n`;
    });

    fs.writeFileSync('out.txt', out);
    process.exit(0);
}

run().catch(err => {
    fs.writeFileSync('out.txt', err.toString());
    process.exit(1);
});
