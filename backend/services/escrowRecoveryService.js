const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const { buildBabyjub } = require('circomlibjs');

const BABYJUB_L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

/**
 * Modulo arithmetic over BN128
 */
function mod(n, p = BABYJUB_L) {
    const result = n % p;
    return result >= 0n ? result : result + p;
}

/**
 * Extended Euclidean Algorithm for modular inverse
 */
function modInverse(a, m = BABYJUB_L) {
    let [m0, y, x] = [m, 0n, 1n];
    if (m === 1n) return 0n;
    let tempA = a;
    while (tempA > 1n) {
        let q = tempA / m;
        let t = m;
        m = tempA % m;
        tempA = t;
        t = y;
        y = x - q * y;
        x = t;
    }
    if (x < 0n) x += m0;
    return x;
}

/**
 * Interpolates polynomial at x = 0 (recovers a0)
 * shares is an array of { x: Number, y: BigInt }
 */
function lagrangeInterpolateAtZero(shares) {
    let secret = 0n;
    for (let i = 0; i < shares.length; i++) {
        const { x: xi, y: yi } = shares[i];
        const xiBig = BigInt(xi);
        
        let numerator = 1n;
        let denominator = 1n;

        for (let j = 0; j < shares.length; j++) {
            if (i === j) continue;
            const xjBig = BigInt(shares[j].x);
            
            numerator = mod(numerator * (0n - xjBig));
            denominator = mod(denominator * (xiBig - xjBig));
        }

        const lagrangeBasis = mod(numerator * modInverse(denominator));
        secret = mod(secret + yi * lagrangeBasis);
    }
    return secret;
}

/**
 * Converts BigInt to 32 byte array
 */
function bigIntToBytes(num) {
    let hex = num.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    hex = hex.padStart(64, '0');
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Simulates the recovery process from the perspective of an authorized recovery client
 */
async function reconstructKey(envelopes, custodianPrivateKeys, commitments) {
    if (envelopes.length < 3) {
        throw new Error('Need at least 3 envelopes to reconstruct');
    }

    const babyJub = await buildBabyjub();
    const F = babyJub.F;
    const G = babyJub.Base8;

    const shares = [];

    // Step 1: Simulate each custodian decrypting their share
    for (let i = 0; i < 3; i++) {
        const env = envelopes[i];
        const privKey = custodianPrivateKeys[env.custodianId];
        
        if (!privKey) throw new Error(`Missing private key for custodian ${env.custodianId}`);

        const nonce = naclUtil.decodeBase64(env.nonce);
        const ephemeralPub = naclUtil.decodeBase64(env.ephemeralPubKey);
        const ciphertext = naclUtil.decodeBase64(env.ciphertext);

        const decryptedBytes = nacl.box.open(ciphertext, nonce, ephemeralPub, privKey);
        
        if (!decryptedBytes) {
            throw new Error(`Failed to decrypt share for custodian ${env.custodianId}`);
        }

        const shareJson = JSON.parse(naclUtil.encodeUTF8(decryptedBytes));
        const shareX = shareJson.x;
        const shareY = BigInt('0x' + shareJson.y);

        // Step 2: Validate share using Feldman Commitments
        // y_i * G == C0 + (x_i * C1) + (x_i^2 * C2)
        const leftSide = babyJub.mulPointEscalar(G, shareY);
        
        const C0 = [F.e(BigInt(commitments[0].x)), F.e(BigInt(commitments[0].y))];
        const C1 = [F.e(BigInt(commitments[1].x)), F.e(BigInt(commitments[1].y))];
        const C2 = [F.e(BigInt(commitments[2].x)), F.e(BigInt(commitments[2].y))];

        const xBig = BigInt(shareX);
        const x2Big = (xBig * xBig) % BABYJUB_L;

        const term1 = babyJub.mulPointEscalar(C1, xBig);
        const term2 = babyJub.mulPointEscalar(C2, x2Big);

        const rightSide = babyJub.addPoint(C0, babyJub.addPoint(term1, term2));

        if (!babyJub.F.eq(leftSide[0], rightSide[0]) || !babyJub.F.eq(leftSide[1], rightSide[1])) {
            throw new Error(`Feldman VSS validation failed for custodian ${env.custodianId}. Share is tampered!`);
        }

        shares.push({ x: shareX, y: shareY });
    }

    // Step 3: Lagrange Interpolation to reconstruct a0
    const a0 = lagrangeInterpolateAtZero(shares);

    // Step 4: Reconstruct Curve25519 keypair
    const masterSeedBytes = bigIntToBytes(a0);
    const patientKeyPair = nacl.box.keyPair.fromSecretKey(masterSeedBytes);

    return {
        a0,
        patientKeyPair
    };
}

module.exports = {
    reconstructKey,
    lagrangeInterpolateAtZero
};
