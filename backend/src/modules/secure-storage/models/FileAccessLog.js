const mongoose = require('mongoose');

const fileAccessLogSchema = new mongoose.Schema(
    {
        secureFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SecureFile',
            required: true,
        },
        fileVersion: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FileVersion',
        },
        accessedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        actionType: {
            type: String,
            required: true,
            enum: ['UPLOADED', 'VIEWED', 'DOWNLOADED', 'UPDATED', 'DECRYPTED', 'DELETED', 'CONSENT_REVOKED'],
        },
        success: {
            type: Boolean,
            default: true,
        },
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        },
        notes: {
            type: String,
        }
    },
    { 
        timestamps: { createdAt: 'accessTime', updatedAt: false } 
    }
);

// Indexes for fast auditing and access queries
fileAccessLogSchema.index({ secureFile: 1, accessTime: -1 });
fileAccessLogSchema.index({ accessedBy: 1, accessTime: -1 });
fileAccessLogSchema.index({ actionType: 1 });

module.exports = mongoose.model('FileAccessLog', fileAccessLogSchema);
