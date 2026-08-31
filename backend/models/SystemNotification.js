const mongoose = require('mongoose');

/**
 * SystemNotification — persisted system-generated alerts for admin
 * Created by background workers, error handlers, and system health checks.
 */
const systemNotificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['error', 'warning', 'info', 'success'],
        default: 'info',
        index: true,
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    source: {
        type: String,  // e.g. 'blockchain', 'redis', 'backup', 'audit', 'api'
        default: 'system',
        index: true,
    },
    read: {
        type: Boolean,
        default: false,
        index: true,
    },
    // Optional metadata
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
}, { timestamps: true });

systemNotificationSchema.index({ createdAt: -1 });
systemNotificationSchema.index({ read: 1, createdAt: -1 });

module.exports = mongoose.model('SystemNotification', systemNotificationSchema);
