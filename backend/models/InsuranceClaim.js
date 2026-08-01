const mongoose = require('mongoose');

const insuranceClaimSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: [true, 'Patient reference is required'],
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        provider: {
            type: String,
            required: [true, 'Insurance provider name is required'],
        },
        policyNumber: {
            type: String,
            required: [true, 'Policy number is required'],
        },
        medicalRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        certificate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Certificate',
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        diagnosisCode: {
            type: String,
        },
        claimAmount: {
            type: Number,
            required: [true, 'Claim amount is required'],
        },
        approvedAmount: {
            type: Number,
            default: 0,
        },
        treatmentSummary: {
            type: String,
        },
        blockchainHash: {
            type: String,
        },
        transactionHash: {
            type: String,
        },
        certificateVerified: {
            type: Boolean,
            default: false,
        },
        blockchainVerified: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ['submitted', 'in_review', 'approved', 'rejected'],
            default: 'submitted',
        },
        rejectionReason: {
            type: String,
        },
        approvalNotes: {
            type: String,
        },
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        processedDate: {
            type: Date,
        },
        submittedDate: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('InsuranceClaim', insuranceClaimSchema);
