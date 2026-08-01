const mongoose = require('mongoose');

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
