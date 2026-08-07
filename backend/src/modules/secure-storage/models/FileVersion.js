const mongoose = require('mongoose');

/**
 * Mongoose schema and model for fileVersionSchema
 * @module models/fileVersionSchema
 * @description Explains the structure and types for the fileVersionSchema collection.
 */
const fileVersionSchema = new mongoose.Schema(
    {
        secureFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SecureFile',
            required: true,
        },
        versionNumber: {
            type: Number,
            required: true,
            default: 1,
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
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Could be doctor or patient
            required: true,
        },
        fileSize: {
            type: Number, // In bytes
            required: true,
        },
        isCurrent: {
            type: Boolean,
            default: true,
        },
        blockchainStatus: {
            type: String,
            enum: ['pending', 'processing', 'confirmed', 'failed'],
            default: 'pending'
        },
        blockchainRetries: {
            type: Number,
            default: 0
        },
        recordTypeStr: {
            type: String,
        }
    },
    { timestamps: true }
);

// Indexes for fast lookup of versions per file
fileVersionSchema.index({ secureFile: 1, versionNumber: -1 });
fileVersionSchema.index({ ipfsCid: 1 });
fileVersionSchema.index({ isCurrent: 1 });

module.exports = mongoose.model('FileVersion', fileVersionSchema);
