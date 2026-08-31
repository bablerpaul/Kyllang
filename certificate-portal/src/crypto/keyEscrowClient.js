import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { buildBabyjub } from 'circomlibjs';

// The BabyJubJub subgroup order (l) for polynomial operations and Feldman VSS
export const BABYJUB_L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

/**
 * Converts a 32-byte Uint8Array to a BigInt
 */
export function bytesToBigInt(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

/**
 * Converts a BigInt to a 32-byte Uint8Array (padded)
 */
export function bigIntToBytes(num) {
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
 * Generate cryptographically secure random BigInt < BABYJUB_L
 */
export function randomScalar() {
  while (true) {
    const bytes = nacl.randomBytes(32);
    const num = bytesToBigInt(bytes);
    if (num < BABYJUB_L) return num;
  }
}

/**
 * Generates an Escrow Package
 * @param {Array<Uint8Array>} custodianPublicKeys - Array of 5 custodian X25519 public keys (32 bytes each)
 * @returns {Promise<Object>} The Escrow Package and the patient's keys
 */
export async function generateEscrowPackage(custodianPublicKeys) {
  if (custodianPublicKeys.length !== 5) {
    throw new Error('Exactly 5 custodian public keys required');
  }

  // 1. Generate Master Seed (a0)
  // We need a0 to be < BABYJUB_L
  const a0 = randomScalar();
  
  // 2. Generate Curve25519 Keypair from a0
  // Note: a0 acts as the high-entropy root seed.
  // nacl.box.keyPair.fromSecretKey applies clamping internally for Curve25519.
  const masterSeedBytes = bigIntToBytes(a0);
  const patientKeyPair = nacl.box.keyPair.fromSecretKey(masterSeedBytes);
  
  // 3. Polynomial Splitting (degree 2)
  const a1 = randomScalar();
  const a2 = randomScalar();
  
  // f(x) = (a0 + a1*x + a2*x^2) mod BABYJUB_L
  const evaluatePolynomial = (x) => {
    const xBig = BigInt(x);
    const x2 = (xBig * xBig) % BABYJUB_L;
    let y = (a0 + (a1 * xBig) % BABYJUB_L) % BABYJUB_L;
    y = (y + (a2 * x2) % BABYJUB_L) % BABYJUB_L;
    return y;
  };
  
  const shares = [];
  for (let i = 1; i <= 5; i++) {
    shares.push({ x: i, y: evaluatePolynomial(i) });
  }
  
  // 4. Feldman Commitments (using BabyJubJub)
  // C_j = a_j * G
  const babyJub = await buildBabyjub();
  const F = babyJub.F;
  const G = babyJub.Base8; // Base point
  
  const c0 = babyJub.mulPointEscalar(G, a0);
  const c1 = babyJub.mulPointEscalar(G, a1);
  const c2 = babyJub.mulPointEscalar(G, a2);
  
  // Helper to format points for smart contract (uint256 x, uint256 y)
  const formatPoint = (point) => {
    return {
      x: '0x' + F.toObject(point[0]).toString(16),
      y: '0x' + F.toObject(point[1]).toString(16)
    };
  };
  
  const commitments = [formatPoint(c0), formatPoint(c1), formatPoint(c2)];
  
  // 5. Custodian Encryption
  // Encrypt each share with tweetnacl (X25519 + XSalsa20-Poly1305)
  // We generate an ephemeral keypair for the patient for this operation to preserve forward secrecy
  const ephemeralKeyPair = nacl.box.keyPair();
  
  const envelopes = shares.map((share, index) => {
    const custodianPub = custodianPublicKeys[index];
    
    // Serialize share to JSON then bytes
    const shareBytes = naclUtil.decodeUTF8(JSON.stringify({ x: share.x, y: share.y.toString(16) }));
    
    // Unique nonce
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    
    // Encrypt
    const encryptedBox = nacl.box(
      shareBytes, 
      nonce, 
      custodianPub, 
      ephemeralKeyPair.secretKey
    );
    
    return {
      custodianId: index + 1,
      ephemeralPubKey: naclUtil.encodeBase64(ephemeralKeyPair.publicKey),
      nonce: naclUtil.encodeBase64(nonce),
      ciphertext: naclUtil.encodeBase64(encryptedBox)
    };
  });
  
  // 6. Output Escrow Package
  const escrowPackage = {
    patientPubKey: naclUtil.encodeBase64(patientKeyPair.publicKey),
    commitments,
    envelopes
  };
  
  return {
    patientKeyPair,
    escrowPackage
  };
}
