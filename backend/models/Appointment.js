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

        /**
         * Rescheduling audit: stores the original date/time before the
         * most recent reschedule so the history remains traceable.
         * Only populated when a cancelled appointment is rescheduled.
         */
        rescheduledFrom: {
            appointmentDate: { type: Date },
            timeSlot:        { type: String },
        },
        rescheduledAt: { type: Date },
    },
    {
        timestamps: true,
    }
);

/**
 * Partial unique index: prevents two SCHEDULED appointments for the same
 * doctor/date/timeSlot. Cancelled and no_show appointments are excluded
 * from the index so those slots can be rebooked without conflict.
 */
appointmentSchema.index(
    { doctor: 1, appointmentDate: 1, timeSlot: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'scheduled' },
        name: 'unique_scheduled_slot',
    }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
