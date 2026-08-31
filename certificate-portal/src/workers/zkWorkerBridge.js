/**
 * zkWorkerBridge.js — Main Thread Bridge for zkProofWorker
 *
 * Manages the lifecycle of the ZK proof Web Worker:
 *   - Lazily instantiates the worker on first use (avoids cold-start delay)
 *   - Wraps the worker message protocol in a clean Promise API
 *   - Streams progress updates to an optional onProgress callback
 *   - Terminates the worker on completion or timeout (memory safety)
 *   - Enforces a 5-minute timeout for proof generation
 *
 * Usage:
 *   import { generateProof } from './zkWorkerBridge';
 *
 *   const { proof, publicSignals } = await generateProof(
 *     circuitInput,
 *     (msg) => setStatusMessage(msg)   // optional progress callback
 *   );
 */

// Vite processes `?worker` imports → proper Worker module with bundled deps
import ZkProofWorker from './zkProofWorker?worker';

const PROOF_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── ZK artifact URLs ───────────────────────────────────────────────────────
// These files are distributed by zk-setup.js to certificate-portal/public/zk/
const ZK_BASE_URL  = '/zk';
const WASM_URL     = `${ZK_BASE_URL}/certificate_proof.wasm`;
const ZKEY_URL     = `${ZK_BASE_URL}/circuit_final.zkey`;

/**
 * Generate a Groth16 proof in a dedicated Web Worker.
 *
 * @param {object}   circuitInput  - snarkjs input (built by buildCircuitInput from poseidonUtils)
 * @param {Function} onProgress    - optional progress callback (message: string) => void
 * @returns {Promise<{ proof: object, publicSignals: string[] }>}
 * @throws Error if proof fails or times out
 */
export function generateProof(circuitInput, onProgress) {
    return new Promise((resolve, reject) => {
        // Spawn a fresh worker for each proof request to avoid state contamination
        let worker;
        try {
            worker = new ZkProofWorker();
        } catch (err) {
            return reject(new Error(
                `Failed to spawn ZK Worker: ${err.message}. ` +
                'Ensure COOP/COEP headers are set in vite.config.js.'
            ));
        }

        // ── Timeout guard ──────────────────────────────────────────────────
        const timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error(`ZK proof generation timed out after ${PROOF_TIMEOUT_MS / 60000} minutes`));
        }, PROOF_TIMEOUT_MS);

        // ── Message handler ────────────────────────────────────────────────
        worker.onmessage = (event) => {
            const { type, payload } = event.data;

            switch (type) {
                case 'PROOF_PROGRESS':
                    if (typeof onProgress === 'function') {
                        onProgress(payload.message);
                    }
                    break;

                case 'PROOF_READY':
                    clearTimeout(timeoutId);
                    worker.terminate();
                    resolve({
                        proof:         payload.proof,
                        publicSignals: payload.publicSignals,
                    });
                    break;

                case 'PROOF_ERROR':
                    clearTimeout(timeoutId);
                    worker.terminate();
                    reject(new Error(`Worker proof error: ${payload.message}`));
                    break;

                default:
                    // Unknown message type — ignore
                    break;
            }
        };

        // ── Error handler (worker crash) ───────────────────────────────────
        worker.onerror = (err) => {
            clearTimeout(timeoutId);
            worker.terminate();
            reject(new Error(`ZK Worker crashed: ${err.message}`));
        };

        // ── Dispatch proof generation task ─────────────────────────────────
        worker.postMessage({
            type: 'GENERATE_PROOF',
            payload: {
                circuitInput,
                wasmUrl: new URL(WASM_URL, window.location.origin).href,
                zkeyUrl: new URL(ZKEY_URL, window.location.origin).href,
            },
        });
    });
}

/**
 * Verify a Groth16 proof locally using the verification key.
 * Called by the Verifier UI to trustlessly verify without hitting the backend.
 *
 * @param {object}   proof
 * @param {string[]} publicSignals
 * @param {object}   vKey - loaded from /zk/verification_key.json
 * @returns {Promise<boolean>}
 */
export async function verifyProofLocally(proof, publicSignals, vKey) {
    const { groth16 } = await import('snarkjs');
    return groth16.verify(vKey, publicSignals, proof);
}

/**
 * Fetch the verification key from the frontend public directory.
 * Used by the Verifier UI for local proof checking.
 *
 * @returns {Promise<object>} verification key JSON
 */
export async function fetchVerificationKey() {
    const res = await fetch(`${ZK_BASE_URL}/verification_key.json`);
    if (!res.ok) throw new Error(`Failed to fetch verification_key.json: ${res.statusText}`);
    return res.json();
}

// ── Crypto Worker Bridge (X25519) ──────────────────────────────────────────
import ZkWorker from './zkWorker?worker';
import util from 'tweetnacl-util';

let cryptoWorkerInstance = null;
let cryptoMsgIdSeq = 0;
const cryptoPendingResolvers = new Map();

function getCryptoWorker() {
    if (!cryptoWorkerInstance) {
        cryptoWorkerInstance = new ZkWorker();
        cryptoWorkerInstance.onmessage = (e) => {
            const { id, resultBytes, error } = e.data;
            const resolver = cryptoPendingResolvers.get(id);
            if (resolver) {
                cryptoPendingResolvers.delete(id);
                if (error) resolver.reject(new Error(error));
                else resolver.resolve(resultBytes);
            }
        };
        cryptoWorkerInstance.onerror = (err) => {
            console.error("Crypto Worker Error:", err);
        };
    }
    return cryptoWorkerInstance;
}

export function workerEncryptKey(payloadStr, recipientPublicKeyBase64) {
    return new Promise((resolve, reject) => {
        try {
            const recipientPK = util.decodeBase64(recipientPublicKeyBase64);
            const payloadBytes = new Uint8Array(payloadStr.length);
            for (let i = 0; i < payloadStr.length; i++) {
                payloadBytes[i] = payloadStr.charCodeAt(i);
            }

            const id = ++cryptoMsgIdSeq;
            cryptoPendingResolvers.set(id, {
                resolve: (resBytes) => resolve(util.encodeBase64(resBytes)),
                reject
            });

            getCryptoWorker().postMessage(
                { id, op: 'encryptKey', payloadBytes, recipientPK }
            );
        } catch (err) {
            reject(err);
        }
    });
}

export function workerDecryptKey(encryptedPayloadBase64, myPrivateKeyBase64) {
    return new Promise((resolve, reject) => {
        try {
            const encryptedPayloadBytes = util.decodeBase64(encryptedPayloadBase64);
            const myPrivKey = util.decodeBase64(myPrivateKeyBase64);

            const id = ++cryptoMsgIdSeq;
            cryptoPendingResolvers.set(id, {
                resolve: (resBytes) => {
                    let payloadStr = '';
                    for (let i = 0; i < resBytes.length; i++) {
                        payloadStr += String.fromCharCode(resBytes[i]);
                    }
                    resolve(payloadStr);
                },
                reject
            });

            getCryptoWorker().postMessage(
                { id, op: 'decryptKey', encryptedPayloadBytes, myPrivKey }
            );
        } catch (err) {
            reject(err);
        }
    });
}

