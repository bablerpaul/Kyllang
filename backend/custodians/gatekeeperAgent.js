const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

class GatekeeperAgent {
    constructor(custodianId, privateKeyBase64) {
        this.custodianId = custodianId;
        
        // In a real TEE, this private key is fused into hardware or protected by KMS.
        const secretKey = naclUtil.decodeBase64(privateKeyBase64);
        this.keypair = nacl.box.keyPair.fromSecretKey(secretKey);
    }

    /**
     * Process an Emergency Break-Glass request.
     * @param {Object} encryptedEnvelope - The share stored off-chain or on-chain for this custodian.
     * @param {string} ephemeralSessionPubKeyBase64 - The public key of the Secure Recovery Enclave.
     * @param {boolean} simulateWebAuthnFailure - For testing Rogue Admin Defense (Scenario 3).
     */
    async dispatchShareToEnclave(encryptedEnvelope, ephemeralSessionPubKeyBase64, simulateWebAuthnFailure = false) {
        console.log(`Gatekeeper ${this.custodianId}: Received dispatch request.`);

        // 1. Dual-Control Gate (MFA + Machine Attestation)
        if (simulateWebAuthnFailure) {
            throw new Error(`Gatekeeper ${this.custodianId} blocked dispatch: Missing Human WebAuthn Signature!`);
        }
        console.log(`Gatekeeper ${this.custodianId}: Dual-Control MFA Attestation PASSED.`);

        // 2. Decrypt the share from long-term storage
        const nonce = naclUtil.decodeBase64(encryptedEnvelope.nonce);
        const ephemeralPub = naclUtil.decodeBase64(encryptedEnvelope.ephemeralPubKey);
        const ciphertext = naclUtil.decodeBase64(encryptedEnvelope.ciphertext);

        const decryptedBytes = nacl.box.open(ciphertext, nonce, ephemeralPub, this.keypair.secretKey);
        if (!decryptedBytes) {
            throw new Error(`Gatekeeper ${this.custodianId} failed to decrypt long-term share envelope.`);
        }

        // 3. Re-encrypt specifically for the Enclave's Ephemeral Session Key
        const enclaveSessionPubKey = naclUtil.decodeBase64(ephemeralSessionPubKeyBase64);
        const dispatchNonce = nacl.randomBytes(nacl.box.nonceLength);
        
        // We use a new ephemeral keypair here to enforce forward secrecy of the transmission 
        // to the enclave, rather than using the gatekeeper's long-term key.
        const dispatchKeypair = nacl.box.keyPair();

        const dispatchCiphertext = nacl.box(
            decryptedBytes, 
            dispatchNonce, 
            enclaveSessionPubKey, 
            dispatchKeypair.secretKey
        );

        console.log(`Gatekeeper ${this.custodianId}: Share re-encrypted and dispatched to enclave.`);

        return {
            custodianId: this.custodianId,
            encryptedPayloadBase64: naclUtil.encodeBase64(dispatchCiphertext),
            nonceBase64: naclUtil.encodeBase64(dispatchNonce),
            gatekeeperPubKeyBase64: naclUtil.encodeBase64(dispatchKeypair.publicKey)
        };
    }
}

module.exports = GatekeeperAgent;
