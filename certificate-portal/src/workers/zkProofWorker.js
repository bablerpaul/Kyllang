/**
 * zkProofWorker.js — Kyllang ZK Proof Web Worker
 *
 * Runs in a dedicated browser Web Worker thread to prevent main-thread
 * UI blocking during Groth16 proof generation (typically 5–30 seconds).
 *
 * Message protocol:
 *   INBOUND (postMessage to worker):
 *     { type: 'GENERATE_PROOF', payload: { circuitInput, wasmUrl, zkeyUrl } }
 *
 *   OUTBOUND (postMessage from worker):
 *     { type: 'PROOF_READY',   payload: { proof, publicSignals } }
 *     { type: 'PROOF_ERROR',   payload: { message, stack } }
 *     { type: 'PROOF_PROGRESS',payload: { message } }
 *
 * circuitInput shape:
 *   {
 *     patientId:          string  (BigInt decimal — private)
 *     diagnosisCode:      string  (BigInt decimal — private)
 *     validFrom:          string  (BigInt decimal — private)
 *     secretSalt:         string  (BigInt decimal — private)
 *     expectedCommitment: string  (BigInt decimal — public)
 *     challengeNonce:     string  (BigInt decimal — public)
 *   }
 *
 * SECURITY NOTE:
 *   This worker never posts private inputs back to the main thread.
 *   Only the proof and publicSignals (commitment, nonce, sessionCommitment)
 *   are returned — these are designed to be public by the ZK protocol.
 */

// snarkjs must be imported as a full module (CommonJS compat via Vite worker bundling)
import { groth16 } from 'snarkjs';

// ── Logger for snarkjs internal messages ──────────────────────────────────
const snarkLogger = {
    debug: () => {},
    info:  (msg) => self.postMessage({ type: 'PROOF_PROGRESS', payload: { message: msg } }),
    warn:  (msg) => self.postMessage({ type: 'PROOF_PROGRESS', payload: { message: `[warn] ${msg}` } }),
    error: (msg) => self.postMessage({ type: 'PROOF_PROGRESS', payload: { message: `[error] ${msg}` } }),
};

// ── Message Handler ────────────────────────────────────────────────────────
self.onmessage = async function handleMessage(event) {
    const { type, payload } = event.data;

    if (type !== 'GENERATE_PROOF') return;

    const { circuitInput, wasmUrl, zkeyUrl } = payload;

    try {
        // ── Validate circuit inputs ────────────────────────────────────────
        const requiredFields = ['patientId', 'diagnosisCode', 'validFrom', 'secretSalt', 'expectedCommitment', 'challengeNonce'];
        for (const field of requiredFields) {
            if (circuitInput[field] === undefined || circuitInput[field] === null) {
                throw new Error(`Missing required circuit input: ${field}`);
            }
        }

        self.postMessage({
            type: 'PROOF_PROGRESS',
            payload: { message: 'Loading proving artifacts (WASM + zkey)…' },
        });

        // ── Fetch WASM + zkey from public directory ────────────────────────
        // Use absolute URLs (passed by bridge) to avoid Service Worker caching issues
        const [wasmResponse, zkeyResponse] = await Promise.all([
            fetch(wasmUrl),
            fetch(zkeyUrl),
        ]);

        if (!wasmResponse.ok) throw new Error(`Failed to fetch WASM: ${wasmResponse.statusText}`);
        if (!zkeyResponse.ok) throw new Error(`Failed to fetch zkey: ${zkeyResponse.statusText}`);

        const wasmBuffer = await wasmResponse.arrayBuffer();
        const zkeyBuffer = await zkeyResponse.arrayBuffer();

        self.postMessage({
            type: 'PROOF_PROGRESS',
            payload: { message: 'Artifacts loaded. Computing witness and generating Groth16 proof…' },
        });

        // ── Generate Groth16 proof ─────────────────────────────────────────
        // groth16.fullProve accepts:
        //   - input: object with field element strings
        //   - wasmFile: ArrayBuffer or URL
        //   - zkeyFileName: ArrayBuffer or URL
        //   - logger: optional logger
        const { proof, publicSignals } = await groth16.fullProve(
            circuitInput,
            new Uint8Array(wasmBuffer),
            new Uint8Array(zkeyBuffer),
            snarkLogger
        );

        // ── Sanity check: public signals layout ───────────────────────────
        if (!publicSignals || publicSignals.length !== 3) {
            throw new Error(
                `Unexpected publicSignals length: ${publicSignals?.length}. Expected 3. ` +
                'Check circuit definition and public signal declarations.'
            );
        }

        self.postMessage({
            type: 'PROOF_PROGRESS',
            payload: { message: `Proof generated. publicSignals: [${publicSignals.map(s => s.slice(0,8) + '…').join(', ')}]` },
        });

        // ── Return proof (NEVER return private inputs) ────────────────────
        self.postMessage({
            type: 'PROOF_READY',
            payload: {
                proof,
                publicSignals,
                // publicSignals[0] = expectedCommitment
                // publicSignals[1] = challengeNonce
                // publicSignals[2] = sessionCommitment (Poseidon2(commitment, nonce))
            },
        });

    } catch (err) {
        self.postMessage({
            type: 'PROOF_ERROR',
            payload: {
                message: err.message || 'Unknown proof generation error',
                stack:   err.stack,
            },
        });
    }
};

// Worker initialization acknowledgement
self.postMessage({ type: 'PROOF_PROGRESS', payload: { message: 'ZK Proof Worker initialised' } });
