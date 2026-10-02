const mongoose = require('mongoose');

const certificateAccessRequestSchema = new mongoose.Schema(
    {
        certificate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Certificate',
            required: true,
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            required: true,
        },
        doctorEncryptedCredential: {
            type: String,
        },
        requestedAt: {
            type: Date,
            default: Date.now,
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
        expiresAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Support efficient lookup for doctor pending requests, and patient pending requests.
certificateAccessRequestSchema.index({ certificate: 1, doctor: 1, status: 1 });
certificateAccessRequestSchema.index({ patient: 1, status: 1 });
certificateAccessRequestSchema.index({ doctor: 1, status: 1 });

// Duplicate request safety:
// A doctor should not have multiple simultaneous pending requests for the SAME certificate.
// We can use a partial unique index for this.
certificateAccessRequestSchema.index(
    { certificate: 1, doctor: 1 },
    { 
        unique: true, 
        partialFilterExpression: { status: 'pending' } 
    }
);

module.exports = mongoose.model('CertificateAccessRequest', certificateAccessRequestSchema);
