const mongoose = require('mongoose');

try {
    const DoctorCertificateRequest = require('./models/DoctorCertificateRequest');
    console.log("SUCCESS: Schema loaded successfully!");
    console.log("Model Name:", DoctorCertificateRequest.modelName);
    
    const fields = Object.keys(DoctorCertificateRequest.schema.paths);
    console.log("Fields:", fields.join(", "));
    
    process.exit(0);
} catch (error) {
    console.error("FAILURE: Error loading schema:");
    console.error(error);
    process.exit(1);
}
