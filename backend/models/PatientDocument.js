const mongoose = require('mongoose');

const patientDocumentSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        title: {
            type: String,
            required: [true, 'Please add a title for the document'],
        },
        type: {
            type: String,
            enum: ['blood_test', 'vaccine_certificate', 'other'],
            default: 'other',
        },
        // The AES-encrypted JSON payload
        encryptedData: {
            type: String,
            required: true,
        },
        // K encrypted with the patient's public RSA key
        patientEncryptedKey: {
            type: String, // Base64 or Hex
            required: true,
        },
        // Array of doctor IDs and their specific Enc_doctor(K) along with expiry
        accessList: [
            {
                doctor: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                doctorEncryptedKey: {
                    type: String, // K re-encrypted with doctor's RSA public key
                },
                expiresAt: {
                    type: Date,
                }
            },
        ],
        // Array of pending doctor requests
        accessRequests: [
            {
                doctor: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                requestedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('PatientDocument', patientDocumentSchema);
