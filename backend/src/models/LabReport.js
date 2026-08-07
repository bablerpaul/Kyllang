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
            ref: 'User',
            required: true,
        },
        orderedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        testCategory: {
            type: String,
            required: true,
        },
        testName: {
            type: String,
            required: true,
        },
        resultsSummary: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'completed'],
            default: 'completed',
        },
        reportHash: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('LabReport', labReportSchema);
