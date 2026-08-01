const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        bloodGroup: {
            type: String,
            enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
            default: 'Unknown',
        },
        allergies: [
            {
                type: String,
            },
        ],
        chronicConditions: [
            {
                type: String,
            },
        ],
        vitals: {
            bloodPressure: { type: String, default: '120/80' },
            heartRate: { type: Number, default: 72 },
            temperature: { type: Number, default: 98.6 },
            weight: { type: Number },
            height: { type: Number },
        },
        medicalHistory: [
            {
                condition: String,
                diagnosedDate: Date,
                status: { type: String, enum: ['active', 'resolved'], default: 'active' },
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
