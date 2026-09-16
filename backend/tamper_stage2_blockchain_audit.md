# Blockchain Integrity Anchoring Design & Compatibility Audit

## 1. Existing EMRRegistry.sol Architecture
The current `EMRRegistry.sol` contract anchors metadata without storing actual EMR data.
- **State Variables**: `owner`, `anchors[]`, `emrRecords[]`.
- **Mappings**: `hashToRecordIndex` (maps a `dataHash` to its index + 1).
- **Functions**: `storeEMRRecord`, `verifyRecordHash`, `getEMRRecord`, plus legacy batch functions (`storeHash`, `getAnchor`).
- **Events**: `RecordAnchored`, `HashAnchored`.
- **Current Flow**: The backend calculates a `dataHash` and anchors it alongside `patientCommitment` (to identify the patient pseudonymously), `recordType`, and `ipfsCid`.

## 2. Existing Anchoring Flow
1. **Controller**: `emrRecordController.js` creates/updates an EMR.
2. **Hash**: Generates legacy `dataHash` using `JSON.stringify(sortedObject)`.
3. **Transaction**: Calls `blockchainContract.storeEMRRecord(patientCommitment, "MedicalRecord", dataHash, ipfsCid)`.
4. **Database**: Saves the resulting transaction hash back to MongoDB in `emr.transactionHash` and `emr.blockchainHash`, along with an `AuditLog` entry.

## 3. Compatibility Analysis
The new `integrityHash`, `integrityVersion`, and `previousIntegrityHash` system cannot simply replace the `_dataHash` argument in the existing `storeEMRRecord` function if we want to provide robust rollback detection. 
The current contract maps `dataHash -> record`. It does **not** group hashes by the specific EMR document they belong to (only by the generic `patientCommitment`, which applies to all records for that patient). 
Therefore, **Extending EMRRegistry.sol (Option D)** is the only viable path. We will add a parallel data structure specifically for Version-Aware Integrity, leaving the legacy `storeEMRRecord` fully intact and untouched for backward compatibility.

## 4 & 5. Version Strategy & Rollback Detection
**The Rollback Attack:**
If an attacker restores a MongoDB backup from yesterday (Version 1), the legacy contract will still return `exists = true` for Version 1's hash, incorrectly passing validation.
**The Solution:**
The blockchain must track the lineage of a specific record. 
By mapping a `recordCommitment` (a pseudonymous hash of the EMR's `_id`) to its `latestVersion` and `latestIntegrityHash`, the blockchain acts as the ultimate chronological source of truth.
If MongoDB presents Version 1, but the blockchain states `latestVersion == 3`, the engine instantly triggers a **ROLLBACK DETECTED** state.

## 6. Version State Handling on Chain
The contract should store:
- An append-only array of `IntegrityAnchor` structs (history).
- `mapping(bytes32 => uint256) latestVersion` (for instant rollback detection).
- `mapping(bytes32 => string) latestIntegrityHash` (for instant tip-of-chain validation).
This allows the backend to perform O(1) checks against the latest state without iterating through arrays.

## 7. Privacy Analysis
The blockchain must remain strictly Zero-Knowledge regarding PHI:
- **No** plain clinical data (diagnosis, symptoms, etc.)
- **No** plaintext identifiers (`_id`, patient name).
- We will store ONLY: `integrityHash`, `previousIntegrityHash`, `version`, and `recordCommitment`.

## 8. Patient / Record Identification Strategy
To track a specific EMR without leaking its `_id`, we use a cryptographic commitment:
`recordCommitment = SHA256(emr._id + MASTER_ENCRYPTION_KEY)`
This allows the backend to deterministically link versions of the same EMR on-chain while remaining computationally irreversible for outside observers. It prevents correlation attacks against `patientCommitment`.

## 9. Duplicate Anchor Protection
To prevent network timeouts or backend restarts from anchoring the same version twice:
The smart contract must enforce: `require(_version > latestVersion[recordCommitment], "Version must strictly increase")`.
If a retry happens, the transaction will revert gracefully, preventing double-billing of gas and duplicate entries.

## 10. Gas / Performance Analysis
**Recommendation**: Option C (Store hash + version + previous hash).
We must anchor every version to preserve the mathematical chain of custody, but we will not use expensive string storage more than necessary. `integrityHash` and `previousIntegrityHash` could be stored as `bytes32` (if passed as hex) to significantly reduce gas costs compared to dynamic `string` arrays.

## 11. Failure Modes & Threat Analysis

| Attack Vector | Detection State | Explanation |
|---|---|---|
| MongoDB Diagnosis Modification | `TAMPER_DETECTED` | Recalculated hash will not exist in the contract's hash mapping. |
| MongoDB Hash Modification | `ANCHOR_NOT_FOUND` | Forged hash placed in DB will not exist on-chain. |
| MongoDB Version Rollback | `VERSION_MISMATCH` | Recalculated hash exists on-chain, but `DB.version < Chain.latestVersion`. |
| PreviousHash Modification | `TAMPER_DETECTED` | Modifying the previous hash alters the canonical payload, breaking the current `integrityHash`. |
| Blockchain TX Replay / Retry | `REJECTED` | Smart contract `require` blocks duplicate version insertions. |

## 12. Contract Modification Plan (Do Not Implement Yet)
We will extend `EMRRegistry.sol` with:
**State Variables**:
- `struct IntegrityAnchor { bytes32 recordCommitment; uint256 version; bytes32 integrityHash; bytes32 previousHash; uint256 timestamp; }`
- `mapping(bytes32 => bytes32) public integrityHashToIndex;`
- `mapping(bytes32 => uint256) public latestRecordVersion;`
- `mapping(bytes32 => bytes32) public latestRecordHash;`

**Functions**:
- `storeIntegrityAnchor(bytes32 _recordCommitment, uint256 _version, bytes32 _integrityHash, bytes32 _previousHash)`
- `verifyIntegrityHash(bytes32 _integrityHash)`
- `getLatestRecordState(bytes32 _recordCommitment)`

**Events**:
- `IntegrityAnchored(bytes32 indexed recordCommitment, uint256 version, bytes32 integrityHash, bytes32 previousHash)`

## 13. Backend Modification Plan
Once the contract is updated, the backend will:
1. Update `blockchain.js` to expose `storeIntegrityAnchor` and `getLatestRecordState`.
2. Update `emrRecordController.js` to anchor both the legacy `storeEMRRecord` and the new `storeIntegrityAnchor`.
3. Create `TamperEngine.js` to orchestrate the verification checks.

## 14. Risks
- **Gas Costs:** Anchoring twice per EMR update temporarily doubles transaction fees until legacy dependencies are fully migrated.
- **Nonce Desync:** High-concurrency updates to the same EMR could trigger nonce collisions or version race conditions in the mempool. (Mitigated by queuing).
