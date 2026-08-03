const mongoose = require('mongoose');

/**
 * Mongoose schema and model for secureFileSchema
 * @module models/secureFileSchema
 * @description Explains the structure and types for the secureFileSchema collection.
 */
const secureFileSchema = new mongoose.Schema(
    {
        fileName: {
            type: String,
            required: true,
            trim: true,
        },
        fileType: {
            type: String,
            required: true,
            enum: ['EMR', 'MedicalCertificate', 'LabReport', 'Prescription', 'InsuranceClaim', 'General'],
            default: 'General'
        },
        mimeType: {
            type: String,
            required: true,
        },
        encryptionMethod: {
            type: String,
            default: 'AES-256-CBC',
        },
        
        // Relationships
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        linkedEMR: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        linkedCertificate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Certificate',
        },
        linkedInsurance: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InsuranceClaim',
        },
        
        isActive: {
            type: Boolean,
            default: true,
        }
    },
    { timestamps: true }
);

// Indexes for fast lookups by relational entities
secureFileSchema.index({ patient: 1 });
secureFileSchema.index({ doctor: 1 });
secureFileSchema.index({ linkedEMR: 1 });
secureFileSchema.index({ linkedCertificate: 1 });
secureFileSchema.index({ linkedInsurance: 1 });
secureFileSchema.index({ fileType: 1 });

secureFileSchema.pre('validate', function() {
    if (!this.linkedEMR && !this.linkedCertificate && !this.linkedInsurance) {
        throw new Error('A SecureFile must be linked to at least one of the following: linkedEMR, linkedCertificate, or linkedInsurance.');
    }
});

secureFileSchema.index({ createdAt: -1 });
secureFileSchema.index({ isActive: 1 });

module.exports = mongoose.model('SecureFile', secureFileSchema);
