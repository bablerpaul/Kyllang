const mongoose = require('mongoose');

const doctorCertificateRequestSchema = new mongoose.Schema(
    {
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true,
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
        },
        certificateType: {
            type: String,
            enum: ['vaccine', 'age_verification', 'general'],
            required: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
            maxLength: 1000,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'consumed'],
            default: 'pending',
            required: true,
        },
        approvedAt: {
            type: Date,
        },
        rejectedAt: {
            type: Date,
        },
        rejectionReason: {
            type: String,
            trim: true,
            maxLength: 1000,
        },
        consumedAt: {
            type: Date,
        },
        lockedAt: {
            type: Date,
        },
        certificate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Certificate',
        },
    },
    {
        timestamps: true,
    }
);

doctorCertificateRequestSchema.index({ doctor: 1, status: 1 });
doctorCertificateRequestSchema.index({ patient: 1, status: 1 });

module.exports = mongoose.model('DoctorCertificateRequest', doctorCertificateRequestSchema);
