const mongoose = require('mongoose');

const escrowStoreSchema = new mongoose.Schema({
    patientPubKey: {
        type: String,
        required: true,
        unique: true
    },
    // The envelopes that aren't stored on-chain
    envelopes: [{
        custodianId: { type: Number, required: true },
        ephemeralPubKey: { type: String, required: true },
        nonce: { type: String, required: true },
        ciphertext: { type: String, required: true }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('EscrowStore', escrowStoreSchema);
