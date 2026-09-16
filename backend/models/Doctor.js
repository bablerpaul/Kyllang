const mongoose = require('mongoose');

/**
 * Mongoose schema and model for doctorSchema
 * @module models/doctorSchema
 * @description Explains the structure and types for the doctorSchema collection.
 */

/**
 * Per-day availability sub-schema.
 * _id is disabled to keep the document clean (no nested IDs).
 */
const dayAvailabilitySchema = new mongoose.Schema(
    {
        enabled:   { type: Boolean, default: false },
        startTime: { type: String,  default: '09:00' }, // HH:MM (24-hour)
        endTime:   { type: String,  default: '17:00' }, // HH:MM (24-hour)
    },
    { _id: false }
);

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

        /**
         * Weekly availability schedule.
         * Each day is independently configured.
         * Defaults to all days disabled (not configured) for legacy doctors.
         */
        availability: {
            monday:    { type: dayAvailabilitySchema, default: () => ({}) },
            tuesday:   { type: dayAvailabilitySchema, default: () => ({}) },
            wednesday: { type: dayAvailabilitySchema, default: () => ({}) },
            thursday:  { type: dayAvailabilitySchema, default: () => ({}) },
            friday:    { type: dayAvailabilitySchema, default: () => ({}) },
            saturday:  { type: dayAvailabilitySchema, default: () => ({}) },
            sunday:    { type: dayAvailabilitySchema, default: () => ({}) },
        },

        /**
         * Slot duration in minutes. Defaults to 30 minutes.
         * Valid range: 5–480 minutes (8 hours).
         */
        appointmentDuration: {
            type: Number,
            default: 30,
            min: [5,   'appointmentDuration must be at least 5 minutes.'],
            max: [480, 'appointmentDuration cannot exceed 480 minutes (8 hours).'],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Doctor', doctorSchema);
