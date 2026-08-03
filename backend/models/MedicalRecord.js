const mongoose = require('mongoose');

/**
 * Mongoose schema and model for medicalRecordSchema
 * @module models/medicalRecordSchema
 * @description Explains the structure and types for the medicalRecordSchema collection.
 */
const medicalRecordSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: [true, 'Patient reference is required'],
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: [true, 'Doctor reference is required'],
        },
        diagnosis: {
            type: String,
            required: [true, 'Diagnosis is required'],
        },
        symptoms: [
            {
                type: String,
            },
        ],
        vitalSigns: {
            bloodPressure: { type: String, default: '120/80' },
            heartRate: { type: Number, default: 72 },
            temperature: { type: Number, default: 98.6 },
            respiratoryRate: { type: Number, default: 16 },
            oxygenSaturation: { type: Number, default: 98 },
            weight: { type: Number },
            height: { type: Number },
        },
        vitals: {
            bloodPressure: String,
            heartRate: Number,
            temperature: Number,
            respiratoryRate: Number,
            weight: Number,
            height: Number,
        },
        allergies: [
            {
                type: String,
            },
        ],
        medications: [
            {
                name: { type: String, required: true },
                dosage: String,
                frequency: String,
                duration: String,
            },
        ],
        clinicalNotes: {
            type: String,
        },
        chiefComplaint: {
            type: String,
        },
        treatmentPlan: {
            type: String,
        },
        visitDate: {
            type: Date,
            default: Date.now,
        },
        attachments: [
            {
                title: { type: String, required: true },
                fileUrl: String,
                ipfsCid: String, // IPFS CID stored in MongoDB
                fileHash: String,
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
        // Cryptographic SHA256 Hash of JSON-serialized medical record
        dataHash: {
            type: String,
        },
        recordHash: {
            type: String,
        },
        // Blockchain Transaction Hash
        transactionHash: {
            type: String,
        },
        blockchainHash: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Performance Indexes
medicalRecordSchema.index({ patient: 1, visitDate: -1 });
medicalRecordSchema.index({ doctor: 1, visitDate: -1 });

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
