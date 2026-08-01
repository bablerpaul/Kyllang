const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        dateOfBirth: {
            type: Date,
        },
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
        },
        contactNumber: {
            type: String,
        },
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
        },
        emergencyContact: {
            name: String,
            relationship: String,
            phone: String,
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
        assignedDoctors: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Doctor',
            },
        ],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Patient', patientSchema);
