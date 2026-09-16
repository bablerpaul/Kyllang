# Implementation Plan for TASK 5D: Version-Aware Blockchain Integrity Anchoring

## Goal Description
Implement version-aware EMR integrity anchoring by extending the existing `EMRRegistry.sol` smart contract and backend `blockchain.js` service. This allows local development verification to track chronological versioning, block unauthorized anchors, and prevent rollback attacks, all while preserving 100% backward compatibility with legacy `dataHash` anchoring.

## Proposed Changes

### Smart Contract (`contracts/EMRRegistry.sol`)
Extend the existing contract to include integrity anchoring without breaking legacy structures.
- **New Structs/State Variables:**
  - `struct IntegrityAnchor { bytes32 recordCommitment; uint256 version; bytes32 integrityHash; bytes32 previousHash; uint256 timestamp; }`
  - `mapping(bytes32 => uint256) public latestRecordVersion;`
  - `mapping(bytes32 => bytes32) public latestRecordHash;`
  - `IntegrityAnchor[] public integrityAnchors;`
- **New Events:**
  - `event IntegrityAnchored(bytes32 indexed recordCommitment, uint256 version, bytes32 integrityHash, bytes32 previousHash, uint256 timestamp);`
- **New Functions:**
  - `storeIntegrityAnchor(bytes32 recordCommitment, uint256 version, bytes32 integrityHash, bytes32 previousHash)` (with checks for version increment, zero-values, correct `previousHash`, and access control).
  - `getLatestRecordState(bytes32 recordCommitment)`
  - `getHistoricalIntegrityAnchor(uint256 index)`

### Backend Blockchain Adapter (`blockchain.js` & Contract ABIs)
- Update the ABI used in `blockchain.js` to match the newly compiled contract.
- Add `storeIntegrityAnchor`, `getLatestRecordState`, and `getHistoricalIntegrityAnchor` wrapper methods.
- Define a backend state machine for anchoring (e.g. `ANCHOR_PENDING`, `ANCHORED`, `ANCHOR_FAILED`, `VERSION_MISMATCH`).

### Cryptographic Record Commitment (`src/utils/canonicalize.js`)
- Implement `generateRecordCommitment(recordId)` using `HMAC-SHA256(MASTER_ENCRYPTION_KEY, recordId)`.
- Returns a 32-byte hex string (represented as `bytes32` in Solidity).

### Tests (`scripts/test-integrity-blockchain.js`)
- Write an extensive script leveraging the backend methods to test:
  1. Valid versions (V1, V2, V3) properly chained.
  2. Duplicate rejection, decrease rejection, invalid previous hash rejection.
  3. Rollback detection simulation (asserting differences between older stored state and latest blockchain state).
  4. Access control (if applicable, using a non-owner signer).
  5. Privacy assertion (checking transaction payload for any PHI leaks).

## Verification Plan

### Automated Tests
- Run `node scripts/test-integrity-blockchain.js` to thoroughly vet the new anchoring behavior.
- Re-run `node scripts/test-comprehensive.js` and `node scripts/test-e2e-zkp.js` to assert that zero legacy functionality was degraded by modifying the contract.

## Open Questions

> [!WARNING]
> Since we are modifying `contracts/EMRRegistry.sol`, the local test environment will need to pick up the updated contract. Our test script `scripts/test-integrity-blockchain.js` will likely redeploy the contract in-memory (using `deploy.js` or directly via ethers) to test the new functionality, preventing any disruption to existing test setups. Are you comfortable with the test script handling its own ephemeral contract deployment?
