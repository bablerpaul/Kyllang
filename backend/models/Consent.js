const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: [true, 'Patient reference is required'],
        },
        patientUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        grantedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // User ID of Doctor or Insurance representative
        },
        grantedToDoctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        grantedToRole: {
            type: String,
            enum: ['doctor', 'insurance', 'hospital_admin'],
            required: true,
        },
        grantedToEntityName: {
            type: String, // Doctor name or Insurance Provider name (e.g., "BlueCross Insurance", "Dr. Smith")
        },
        scope: {
            type: String,
            enum: ['full_access', 'medical_records', 'lab_reports', 'prescriptions', 'certificates', 'insurance_claims'],
            default: 'full_access',
        },
        status: {
            type: String,
            enum: ['active', 'revoked', 'expired'],
            default: 'active',
        },
        grantedAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
        },
        signatureHash: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Consent', consentSchema);
