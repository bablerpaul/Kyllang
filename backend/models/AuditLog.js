const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        action: {
            type: String,
            required: true,
            // Flexible string or enum supporting CREATED, UPDATED, DELETED, VIEWED, etc.
        },
        ipAddress: {
            type: String,
            default: '127.0.0.1',
        },
        blockchainTransaction: {
            type: String,
            default: null,
        },
        transactionHash: {
            type: String,
            default: null,
        },
        hash: {
            type: String,
            default: null,
        },
        blockchainHash: {
            type: String,
            default: null,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        isAnchored: {
            type: Boolean,
            default: false,
            index: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// Pre-save middleware to synchronize user/actor and hash/blockchainHash
auditLogSchema.pre('save', function (next) {
    if (!this.user && this.actor) {
        this.user = this.actor;
    }
    if (!this.actor && this.user) {
        this.actor = this.user;
    }
    if (!this.hash && this.blockchainHash) {
        this.hash = this.blockchainHash;
    }
    if (!this.blockchainHash && this.hash) {
        this.blockchainHash = this.hash;
    }
    if (!this.blockchainTransaction && this.transactionHash) {
        this.blockchainTransaction = this.transactionHash;
    }
    if (!this.transactionHash && this.blockchainTransaction) {
        this.transactionHash = this.blockchainTransaction;
    }
    next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
