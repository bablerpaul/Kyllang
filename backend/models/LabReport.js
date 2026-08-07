const mongoose = require('mongoose');

/**
 * Mongoose schema and model for labReportSchema
 * @module models/labReportSchema
 * @description Explains the structure and types for the labReportSchema collection.
 */
const labReportSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: [true, 'Patient reference is required'],
        },
        orderedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: [true, 'Ordering doctor reference is required'],
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        medicalRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        visit: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        testCategory: {
            type: String,
            enum: ['Blood Test', 'Urine Test', 'MRI', 'CT Scan', 'ECG', 'X-ray', 'Ultrasound', 'General Pathology', 'Other'],
            required: [true, 'Test category is required'],
        },
        testName: {
            type: String,
            required: [true, 'Test name is required'],
        },
        results: [
            {
                parameter: { type: String, required: true },
                value: { type: String, required: true },
                unit: String,
                referenceRange: String,
                flag: { type: String, enum: ['normal', 'high', 'low', 'critical'], default: 'normal' },
            },
        ],
        overallSummary: {
            type: String,
        },
        ipfsCid: {
            type: String, // IPFS Content Identifier (CID) stored in MongoDB
        },
        pdfUrl: {
            type: String,
        },
        fileUrl: {
            type: String,
        },
        status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed'],
            default: 'completed',
        },
        reportHash: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('LabReport', labReportSchema);
