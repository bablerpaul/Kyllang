pragma circom 2.1.4;

include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * CertificateProof — Kyllang ZK Certificate Verification Circuit
 *
 * Proves that the prover knows four private inputs whose Poseidon hash
 * equals the publicly registered certificate commitment, while binding
 * the proof to an ephemeral per-session verifier challenge nonce to
 * prevent cross-session replay of valid proofs.
 *
 * Private inputs (never revealed):
 *   patientId    — 248-bit masked BigInt of SHA-256(patientUUID)
 *   diagnosisCode — 248-bit masked BigInt of SHA-256(ICD-11 code)
 *   validFrom    — Unix epoch timestamp (≤ 2^32, safe for BN128)
 *   secretSalt   — 248-bit cryptographically random field element
 *
 * Public inputs (revealed in proof):
 *   expectedCommitment — Poseidon4(patientId, diagnosisCode, validFrom, secretSalt)
 *   challengeNonce     — Verifier's ephemeral 248-bit session nonce
 *
 * Public output (derived in-circuit, verified by Groth16):
 *   sessionCommitment  — Poseidon2(expectedCommitment, challengeNonce)
 *                        Stored on-chain to prevent session replay.
 *                        Quadratic gates on nonce prevent compiler pruning.
 */
template CertificateProof() {
    // ── Private Inputs ──────────────────────────────────────────────────────
    signal input patientId;       // SHA-256(patientUUID) & FIELD_MASK_248
    signal input diagnosisCode;   // SHA-256(ICD-11 code) & FIELD_MASK_248
    signal input validFrom;       // Unix timestamp (≤ 2^32)
    signal input secretSalt;      // crypto.randomBytes(31) as BigInt

    // ── Public Inputs ───────────────────────────────────────────────────────
    signal input expectedCommitment;  // On-chain registered Poseidon hash
    signal input challengeNonce;      // Verifier's session nonce (248-bit)

    // ── Public Output ───────────────────────────────────────────────────────
    signal output sessionCommitment;  // Poseidon(commitment, nonce) — per-session receipt

    // ── Constraint 1: Certificate Commitment Integrity ──────────────────────
    // Prove knowledge of the four private preimage components.
    // Any single wrong input changes the Poseidon output → proof fails.
    component certHasher = Poseidon(4);
    certHasher.inputs[0] <== patientId;
    certHasher.inputs[1] <== diagnosisCode;
    certHasher.inputs[2] <== validFrom;
    certHasher.inputs[3] <== secretSalt;

    // Assert the computed hash equals the public on-chain commitment.
    expectedCommitment === certHasher.out;

    // ── Constraint 2: Session Commitment (Nonce Binding) ────────────────────
    // Poseidon(expectedCommitment, challengeNonce) produces a unique
    // per-session digest. The nonce participates in 2 quadratic gates
    // inside Poseidon, preventing signal pruning by the circom compiler.
    // The output is public so the smart contract can atomically consume it.
    component sessionHasher = Poseidon(2);
    sessionHasher.inputs[0] <== expectedCommitment;
    sessionHasher.inputs[1] <== challengeNonce;

    sessionCommitment <== sessionHasher.out;
}

// Public signals layout for snarkjs / Solidity:
//   pubSignals[0] = expectedCommitment
//   pubSignals[1] = challengeNonce
//   pubSignals[2] = sessionCommitment  (output)
component main {public [expectedCommitment, challengeNonce]} = CertificateProof();
