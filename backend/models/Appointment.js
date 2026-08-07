const mongoose = require('mongoose');

/**
 * Mongoose schema and model for appointmentSchema
 * @module models/appointmentSchema
 * @description Explains the structure and types for the appointmentSchema collection.
 */
const appointmentSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true,
        },
        appointmentDate: {
            type: Date,
            required: true,
        },
        timeSlot: {
            type: String,
            required: true,
        },
        reason: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
            default: 'scheduled',
        },
        clinicalNotes: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
