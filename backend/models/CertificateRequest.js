const mongoose = require('mongoose');

const certificateRequestSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctorRequested: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        certificateType: {
            type: String,
            enum: ['vaccine', 'age_verification', 'general'],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        reason: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('CertificateRequest', certificateRequestSchema);
