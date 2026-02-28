const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: ['CREATE_USER', 'ASSIGN_DOCTOR', 'UPLOAD_DOCUMENT', 'VERIFY_CERTIFICATE', 'ISSUE_CERTIFICATE', 'SYSTEM_ANCHOR', 'OTHER']
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isAnchored: {
        type: Boolean,
        default: false,
        index: true // Indexed for efficient querying of unanchored logs
    },
    blockchainHash: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
