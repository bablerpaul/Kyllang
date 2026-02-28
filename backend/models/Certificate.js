const mongoose = require('mongoose');

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

module.exports = mongoose.model('Certificate', certificateSchema);
