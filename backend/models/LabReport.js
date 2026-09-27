const mongoose = require('mongoose');
const { INVESTIGATION_CATEGORIES, ALL_TEST_CATEGORIES, categoryForTestCategory } = require('../src/modules/lab/labInvestigationCatalog');

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
        // 'Laboratory' | 'Diagnostic'. Always derived from testCategory by the pre('validate') hook below, so it can never
        // disagree with the type. Absent on pre-T10-L7 documents until their next save (readers derive it the same way).
        investigationCategory: {
            type: String,
            enum: INVESTIGATION_CATEGORIES,
        },
        // The investigation TYPE (e.g. 'Hematology', 'MRI'). Legacy values remain valid for existing documents/clients.
        testCategory: {
            type: String,
            enum: ALL_TEST_CATEGORIES,
            required: [true, 'Test category is required'],
        },
        // The specific test (e.g. 'Complete Blood Count (CBC)').
        testName: {
            type: String,
            required: [true, 'Test name is required'],
        },
        // Date the investigation was performed / reported. Optional; readers fall back to createdAt.
        reportDate: {
            type: Date,
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
        // Generic narrative sections shared by all investigations (see REPORT_DETAIL_KEYS). All optional.
        reportDetails: {
            specimen: String,
            bodyRegion: String,
            clinicalIndication: String,
            findings: String,
            impression: String,
            diagnosis: String,
            interpretation: String,
        },
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
        secureFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SecureFile',
        },
        creationMode: {
            type: String,
            enum: ['manual', 'upload'],
            default: 'manual',
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

labReportSchema.pre('validate', function () {
    this.investigationCategory = categoryForTestCategory(this.testCategory) || undefined;
});

module.exports = mongoose.model('LabReport', labReportSchema);
