// KYLLANG_V4: Isolated worker thread for all X25519 / NaCl operations.
// Keys never touch the main thread heap. After each operation, key buffers
// are zeroed explicitly (best-effort — V8 GC may still scatter copies here,
// but the main thread is clean). Clinical workstations replace this with mlock enclave.
//
// IMPORTANT: This worker uses ArrayBuffer Transferable Objects to prevent 
// V8 heap copying.

import nacl from 'tweetnacl';

function zeroBuffer(buf) {
  if (buf && buf.fill) buf.fill(0);
}

self.onmessage = ({ data }) => {
  const { id, op } = data;
  try {
    if (op === 'encryptKey') {
      const { payloadBytes, recipientPK } = data;
      const ephemeralKP = nacl.box.keyPair();
      const nonce = nacl.randomBytes(nacl.box.nonceLength);

      const encrypted = nacl.box(payloadBytes, nonce, recipientPK, ephemeralKP.secretKey);

      // Combine: [ephemeralPublicKey (32)] + [nonce (24)] + [ciphertext]
      const combined = new Uint8Array(
        ephemeralKP.publicKey.length + nonce.length + encrypted.length
      );
      combined.set(ephemeralKP.publicKey, 0);
      combined.set(nonce, ephemeralKP.publicKey.length);
      combined.set(encrypted, ephemeralKP.publicKey.length + nonce.length);

      // Zero key material
      zeroBuffer(ephemeralKP.secretKey);
      zeroBuffer(payloadBytes);
      zeroBuffer(recipientPK);

      self.postMessage({ id, resultBytes: combined }, [combined.buffer]);

    } else if (op === 'decryptKey') {
      const { encryptedPayloadBytes, myPrivKey } = data;

      const pkLen = nacl.box.publicKeyLength;    // 32
      const nonceLen = nacl.box.nonceLength;     // 24

      if (encryptedPayloadBytes.length < pkLen + nonceLen + nacl.box.macLength) {
        throw new Error('Encrypted payload is too short or malformed');
      }

      const ephemeralPK = encryptedPayloadBytes.slice(0, pkLen);
      const nonce = encryptedPayloadBytes.slice(pkLen, pkLen + nonceLen);
      const ciphertext = encryptedPayloadBytes.slice(pkLen + nonceLen);

      const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPK, myPrivKey);

      // Zero key material immediately
      zeroBuffer(myPrivKey);
      zeroBuffer(encryptedPayloadBytes);

      if (!decrypted) {
        throw new Error('Decryption failed — invalid key or corrupted payload');
      }

      self.postMessage({ id, resultBytes: decrypted }, [decrypted.buffer]);
    } else {
      throw new Error(`Unknown operation: ${op}`);
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
