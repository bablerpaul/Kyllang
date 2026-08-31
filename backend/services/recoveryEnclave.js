const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const { buildBabyjub } = require('circomlibjs');
const { lagrangeInterpolateAtZero } = require('./escrowRecoveryService');

const BABYJUB_L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

class SecureRecoveryEnclave {
    constructor() {
        // Map of sessionId -> SessionState
        this.activeSessions = new Map();
    }

    /**
     * Initializes an ephemeral session for break-glass
     * Generates a single-use X25519 keypair.
     */
    initializeSession(sessionId) {
        const ephemeralKeypair = nacl.box.keyPair();
        
        this.activeSessions.set(sessionId, {
            keypair: ephemeralKeypair,
            shares: [], // collected valid shares
            commitments: null, // to be populated
            patientPubKeyHex: null,
            status: 'AWAITING_SHARES',
            createdAt: Date.now()
        });

        return naclUtil.encodeBase64(ephemeralKeypair.publicKey);
    }

    setCommitments(sessionId, commitments, patientPubKeyHex) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.commitments = commitments;
            session.patientPubKeyHex = patientPubKeyHex;
        }
    }

    /**
     * Receives a re-encrypted share from a gatekeeper
     */
    async receiveGatekeeperShare(sessionId, custodianId, encryptedPayloadBase64, nonceBase64, gatekeeperPubKeyBase64) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error("Invalid or expired session");
        if (session.status !== 'AWAITING_SHARES') return; // Already reconstructed or failed

        // 1. Decrypt payload using the ephemeral private key and gatekeeper's public key
        const ciphertext = naclUtil.decodeBase64(encryptedPayloadBase64);
        const nonce = naclUtil.decodeBase64(nonceBase64);
        const gatekeeperPubKey = naclUtil.decodeBase64(gatekeeperPubKeyBase64);

        const decryptedBytes = nacl.box.open(ciphertext, nonce, gatekeeperPubKey, session.keypair.secretKey);
        
        if (!decryptedBytes) {
            throw new Error(`Failed to decrypt share from gatekeeper ${custodianId}`);
        }

        const shareJson = JSON.parse(naclUtil.encodeUTF8(decryptedBytes));
        const shareX = shareJson.x;
        const shareY = BigInt('0x' + shareJson.y);

        // 2. Validate share against Feldman Commitments
        if (!session.commitments) throw new Error("Feldman commitments not loaded for session");
        
        const babyJub = await buildBabyjub();
        const F = babyJub.F;
        const G = babyJub.Base8;

        const leftSide = babyJub.mulPointEscalar(G, shareY);
        
        const C0 = [F.e(BigInt(session.commitments[0].x)), F.e(BigInt(session.commitments[0].y))];
        const C1 = [F.e(BigInt(session.commitments[1].x)), F.e(BigInt(session.commitments[1].y))];
        const C2 = [F.e(BigInt(session.commitments[2].x)), F.e(BigInt(session.commitments[2].y))];

        const xBig = BigInt(shareX);
        const x2Big = (xBig * xBig) % BABYJUB_L;

        const term1 = babyJub.mulPointEscalar(C1, xBig);
        const term2 = babyJub.mulPointEscalar(C2, x2Big);

        const rightSide = babyJub.addPoint(C0, babyJub.addPoint(term1, term2));

        if (!babyJub.F.eq(leftSide[0], rightSide[0]) || !babyJub.F.eq(leftSide[1], rightSide[1])) {
            throw new Error(`Feldman VSS validation failed. Tampered share injected by gatekeeper ${custodianId}`);
        }

        // 3. Add to valid shares if not duplicate
        if (!session.shares.find(s => s.x === shareX)) {
            session.shares.push({ x: shareX, y: shareY });
        }

        // 4. Check if threshold met
        if (session.shares.length >= 3) {
            return await this.reconstructAndStream(sessionId);
        }

        return { status: 'PENDING', sharesCount: session.shares.length };
    }

    /**
     * Executes the interpolation in protected memory.
     */
    async reconstructAndStream(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || session.shares.length < 3) return;

        // 1. Interpolate
        const a0 = lagrangeInterpolateAtZero(session.shares);

        // 2. Derive Keypair
        const masterSeedBytes = this.bigIntToBytes(a0);
        const patientKeyPair = nacl.box.keyPair.fromSecretKey(masterSeedBytes);

        // 3. Simulate Decrypting EMR payload (Mock)
        // In reality, this enclave would fetch the AES-encrypted EMR from cloud storage
        // and decrypt it using `patientKeyPair.secretKey`.
        const decryptedEMR = {
            patientId: session.patientPubKeyHex,
            bloodType: "O-Negative",
            allergies: ["Penicillin", "Peanuts"],
            recentDiagnoses: ["Acute Appendicitis (Simulated)"],
            medications: ["Ibuprofen 400mg"]
        };

        // 4. ZERIOIZE memory immediately
        session.keypair = null;
        session.shares = [];
        masterSeedBytes.fill(0);
        patientKeyPair.secretKey.fill(0);
        session.status = 'READY_TO_STREAM';
        
        return {
            status: 'READY_TO_STREAM',
            decryptedStream: decryptedEMR
        };
    }

    bigIntToBytes(num) {
        let hex = num.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;
        hex = hex.padStart(64, '0');
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }
    
    closeSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }
}

// Singleton instance simulating the physical enclave memory boundary
const enclaveInstance = new SecureRecoveryEnclave();
module.exports = enclaveInstance;
