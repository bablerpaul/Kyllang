const mongoose = require('mongoose');

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
