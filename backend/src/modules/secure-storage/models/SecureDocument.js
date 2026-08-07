const mongoose = require('mongoose');

/**
 * Mongoose schema and model for secureDocumentSchema
 * @module models/secureDocumentSchema
 * @description Explains the structure and types for the secureDocumentSchema collection.
 */
const secureDocumentSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Could be 'Patient' depending on resolving
            required: true,
        },
        uploader: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        documentType: {
            type: String,
            required: true,
            enum: ['EMR', 'MedicalCertificate', 'LabReport', 'Prescription', 'InsuranceClaim', 'Other'],
        },
        ipfsCid: {
            type: String,
            required: true,
        },
        dataHash: {
            type: String,
            required: true,
        },
        blockchainTransactionHash: {
            type: String,
        },
        isEncrypted: {
            type: Boolean,
            default: true,
        },
        accessControlList: [
            {
                user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                grantedAt: { type: Date, default: Date.now },
            }
        ],
        metadata: {
            fileName: String,
            fileSize: Number,
            mimeType: String,
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('SecureDocument', secureDocumentSchema);
