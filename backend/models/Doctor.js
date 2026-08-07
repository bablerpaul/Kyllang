const mongoose = require('mongoose');

/**
 * Mongoose schema and model for doctorSchema
 * @module models/doctorSchema
 * @description Explains the structure and types for the doctorSchema collection.
 */
const doctorSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        specialty: {
            type: String,
            required: true,
        },
        licenseNumber: {
            type: String,
            required: true,
            unique: true,
        },
        department: {
            type: String,
            default: 'General Medicine',
        },
        consultationFee: {
            type: Number,
            default: 0,
        },
        assignedPatients: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Patient',
            },
        ],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Doctor', doctorSchema);
