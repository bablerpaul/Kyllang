const mongoose = require('mongoose');
const Certificate = require('./models/Certificate');
const crypto = require('crypto');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal');
    const cert = await Certificate.findOne().sort({ createdAt: -1 });

    console.log("Found Cert:", cert.verificationHash);

    // Exactly what MyCertificates generates:
    const pId = typeof cert.patient === 'object' ? cert.patient._id : cert.patient;
    const validFrom = cert.validFrom ? cert.validFrom.toISOString().split('T')[0] : null;
    const validUntil = cert.validUntil ? cert.validUntil.toISOString().split('T')[0] : null;

    const qrData = {
        data: {
            patientId: pId.toString(),
            diagnosis: cert.diagnosis,
            validFrom: validFrom,
            validUntil: validUntil
        },
        hash: cert.verificationHash
    };

    console.log("QR Data:", JSON.stringify(qrData, null, 2));

    process.exit(0);
}

run().catch(console.error);
