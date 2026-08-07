// KYLLANG_V4: Worker bridge — all crypto ops are dispatched here, never called inline.
// Fixes Flaw 3 (V8 ghost keys) for web clients. Clinical workstations use the Tauri
// enclave instead (Phase 4). This is the accepted-residual-risk path for web.

let worker = null;
const pendingRequests = new Map();
let reqId = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./zkWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const { id, resultBytes, error } = data;
      const pending = pendingRequests.get(id);
      pendingRequests.delete(id);
      if (!pending) return;
      if (error) {
        pending.reject(new Error(error));
        return;
      }
      
      try {
        if (pending.op === 'encryptKey') {
          // Convert resultBytes to Base64 string
          let binary = '';
          for (let i = 0; i < resultBytes.length; i++) {
            binary += String.fromCharCode(resultBytes[i]);
          }
          const base64 = btoa(binary);
          
          if (resultBytes && resultBytes.fill) resultBytes.fill(0);
          pending.resolve(base64);
        } else if (pending.op === 'decryptKey') {
          // Convert resultBytes to binary string
          let payloadStr = '';
          for (let i = 0; i < resultBytes.length; i++) {
            payloadStr += String.fromCharCode(resultBytes[i]);
          }
          
          if (resultBytes && resultBytes.fill) resultBytes.fill(0);
          pending.resolve(payloadStr);
        }
      } catch (err) {
        pending.reject(err);
      }
    };
    worker.onerror = (err) => {
      console.error('[zkWorkerBridge] Worker error:', err.message);
    };
  }
  return worker;
}

/**
 * Encrypts a payload string using the recipient's X25519 public key.
 * Runs in an isolated Web Worker — key material never touches the main thread.
 * @param {string} payloadStr — binary string (e.g. AES key from forge)
 * @param {string} recipientPublicKeyBase64 — Base64-encoded Curve25519 public key
 * @returns {Promise<string>} Base64-encoded encrypted payload
 */
export async function workerEncryptKey(payloadStr, recipientPublicKeyBase64) {
  if (window.__TAURI__) {
    try {
      const result = await window.__TAURI__.invoke('encrypt_key_enclave', {
        payload: payloadStr,
        recipientPubB64: recipientPublicKeyBase64
      });
      return result;
    } catch (err) {
      console.error('[Tauri IPC] Encryption failed:', err);
      throw new Error(err);
    }
  }

  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pendingRequests.set(id, { resolve, reject, op: 'encryptKey' });
    
    const payloadBytes = new Uint8Array(payloadStr.length);
    for (let i = 0; i < payloadStr.length; i++) {
      payloadBytes[i] = payloadStr.charCodeAt(i);
    }
    
    const binaryString = atob(recipientPublicKeyBase64);
    const recipientPK = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      recipientPK[i] = binaryString.charCodeAt(i);
    }

    getWorker().postMessage(
      { id, op: 'encryptKey', payloadBytes, recipientPK },
      [payloadBytes.buffer, recipientPK.buffer]
    );
  });
}

/**
 * Decrypts an encrypted payload using the user's X25519 private key.
 * Runs in an isolated Web Worker — key material never touches the main thread.
 * @param {string} encryptedPayloadBase64 — Base64-encoded encrypted payload
 * @param {string} myPrivateKeyBase64 — Base64-encoded Curve25519 private key
 * @returns {Promise<string>} Decrypted binary string
 */
export async function workerDecryptKey(encryptedPayloadBase64, myPrivateKeyBase64) {
  if (window.__TAURI__) {
    try {
      const result = await window.__TAURI__.invoke('decrypt_key_enclave', {
        payloadB64: encryptedPayloadBase64,
        myPrivB64: myPrivateKeyBase64
      });
      return result;
    } catch (err) {
      console.error('[Tauri IPC] Decryption failed:', err);
      throw new Error(err);
    }
  }

  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pendingRequests.set(id, { resolve, reject, op: 'decryptKey' });
    
    const encStr = atob(encryptedPayloadBase64);
    const encryptedPayloadBytes = new Uint8Array(encStr.length);
    for (let i = 0; i < encStr.length; i++) {
      encryptedPayloadBytes[i] = encStr.charCodeAt(i);
    }

    const privStr = atob(myPrivateKeyBase64);
    const myPrivKey = new Uint8Array(privStr.length);
    for (let i = 0; i < privStr.length; i++) {
      myPrivKey[i] = privStr.charCodeAt(i);
    }

    getWorker().postMessage(
      { id, op: 'decryptKey', encryptedPayloadBytes, myPrivKey },
      [encryptedPayloadBytes.buffer, myPrivKey.buffer]
    );
  });
}

/**
 * Terminates the worker thread. Call on logout or cleanup.
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    pendingRequests.clear();
  }
}
