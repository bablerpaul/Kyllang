const mongoose = require('mongoose');

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

module.exports = mongoose.model('SecureFile', secureFileSchema);
