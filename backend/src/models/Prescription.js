const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        medications: [
            {
                name: { type: String, required: true },
                dosage: { type: String, required: true },
                frequency: { type: String, required: true },
                duration: { type: String, required: true },
            },
        ],
        instructions: {
            type: String,
        },
        digitalSignatureHash: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);
