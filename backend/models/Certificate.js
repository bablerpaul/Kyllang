const mongoose = require('mongoose');

/**
 * Certificate schema — Kyllang ZK Certificate System
 *
 * PRIVACY NOTE: diagnosis and raw patientId strings are NOT stored here.
 * The publicCommitmentHash (Poseidon4 of private fields) is the only
 * cryptographic reference stored in MongoDB. Plaintext fields have been
 * removed from this schema to enforce zero-leakage at the database layer.
 */
const certificateSchema = new mongoose.Schema(
    {
        // ── Patient / Doctor References ──────────────────────────────────
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
        },
        medicalRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord',
        },
        insuranceClaim: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InsuranceClaim',
        },

        // ── Non-sensitive Metadata (display only) ──────────────────────────
        // Diagnosis and patient details are stored ONLY inside the patient's
        // encrypted local vault. The backend stores only validity dates.
        validFrom: {
            type: Date,
            required: true,
        },
        validUntil: {
            type: Date,
            required: true,
        },
        remarks: {
            type: String,   // General, non-identifying remarks (optional)
        },

        // ── ZK Commitment Hash ────────────────────────────────────────────
        // Poseidon4(patientId_field, diagnosisCode_field, validFrom_unix, secretSalt)
        // Computed client-side by doctor's browser. Registered on-chain.
        // Used as the lookup key for verification.
        publicCommitmentHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // ── Legacy field alias (backward compatibility with existing API calls)
        // Maps to publicCommitmentHash for any legacy code still using verificationHash
        verificationHash: {
            type: String,
            sparse: true,
        },
        // Encrypted patient-only ZKP credential envelope. Never plaintext.
        encryptedCredential: {
            type: String,
            select: false,
        },

        // ── Blockchain Anchoring ──────────────────────────────────────────
        blockchainTxHash: {
            type: String,   // Transaction hash of on-chain registerCertificate() call
        },
        revocationTxHash: {
            type: String,   // Transaction hash of on-chain revokeCertificate() call
        },
        issuerAddress: {
            type: String,   // The doctor's on-chain wallet address (anti-forgery audit)
        },

        // ── Verification Method ───────────────────────────────────────────
        verificationMethod: {
            type: String,
            enum: ['zk_proof', 'hmac_legacy'],
            default: 'zk_proof',
        },

        // ── Certificate Status ────────────────────────────────────────────
        status: {
            type: String,
            enum: ['active', 'expired', 'revoked'],
            default: 'active',
        },
        revokedAt: {
            type: Date,
        },
        revokeReason: {
            type: String,
        },

        // ── Access Control ────────────────────────────────────────────────
        accessList: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    {
        timestamps: true,
    }
);

// ── Indexes ────────────────────────────────────────────────────────────────
certificateSchema.index({ patient: 1 });
certificateSchema.index({ issuedBy: 1 });
certificateSchema.index({ publicCommitmentHash: 1 }, { unique: true });

// ── Pre-save hook: sync legacy alias ──────────────────────────────────────
certificateSchema.pre('save', function () {
    if (this.publicCommitmentHash && !this.verificationHash) {
        this.verificationHash = this.publicCommitmentHash;
    }
});

module.exports = mongoose.model('Certificate', certificateSchema);
