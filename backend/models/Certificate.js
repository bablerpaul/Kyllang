const mongoose = require('mongoose');

/**
 * Mongoose schema and model for certificateSchema
 * @module models/certificateSchema
 * @description Explains the structure and types for the certificateSchema collection.
 */
const certificateSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        medicalRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        insuranceClaim: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InsuranceClaim',
        },
        secureFileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SecureFile',
        },
        diagnosis: {
            type: String,
            required: [true, 'Diagnosis is required'],
        },
        remarks: {
            type: String,
        },
        validFrom: {
            type: Date,
            required: true,
        },
        validUntil: {
            type: Date,
            required: true,
        },
        verificationHash: {
            type: String,
            required: true,
            unique: true,
        },
        blockchainHash: {
            type: String,
        },
        transactionHash: {
            type: String,
        },
        accessList: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User', // List of doctors
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Performance Indexes
certificateSchema.index({ patient: 1 });
certificateSchema.index({ issuedBy: 1 });
certificateSchema.index({ verificationHash: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);
