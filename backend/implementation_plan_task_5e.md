# Implementation Plan for TASK 5E: Kyllang Tamper Detection Engine

## Goal Description
Build the backend verification engine (`TamperEngine.js`) that compares the local MongoDB EMR state against the blockchain integrity anchors. It will expose an API endpoint (`GET /api/emr/:id/verify-integrity`) to return trustworthy integrity statuses without exposing any PHI, and will log the verification events securely.

## Proposed Changes

### 1. TamperEngine Service (`src/services/tamperEngine.js`)
Create a new service module containing the `verifyRecordIntegrity(recordId, reqUserId)` function.
- **Algorithm Flow**:
  1. Retrieve `MedicalRecord` by `recordId`. If not found -> `RECORD_NOT_FOUND`.
  2. Canonicalize the record using `buildIntegrityPayload` (Mongoose getters decrypt PHI seamlessly in-memory).
  3. Calculate `calculatedHash` using `generateIntegrityHash`.
  4. Compare `calculatedHash` with DB's `integrityHash`. If mismatch -> `TAMPER_DETECTED`.
  5. Generate `recordCommitment` using `generateRecordCommitment`.
  6. Query Blockchain for `latestRecordState` (version and hash). If unreachable -> `BLOCKCHAIN_UNAVAILABLE`.
  7. If blockchain returns version 0 -> `ANCHOR_NOT_FOUND`.
  8. Compare DB version vs Blockchain version:
     - `DB < Chain` -> `VERSION_MISMATCH` (Rollback)
     - `DB > Chain` -> `ANCHOR_PENDING`
  9. If `DB == Chain`, compare `calculatedHash` vs `blockchainHash`. If mismatch -> `TAMPER_DETECTED`.
  10. Retrieve historical anchor for `version - 1` by searching the contract's `integrityAnchors` array backwards. Compare DB's `previousIntegrityHash` to the historical chain hash. Mismatch -> `TAMPER_DETECTED`.
  11. If all checks pass -> `INTEGRITY_VERIFIED`.
- **Audit Logging**: Call `logAudit` after verification, recording the action (e.g. `INTEGRITY_VERIFICATION`, `TAMPER_DETECTED`) and the `recordCommitment` (omitting PHI).

### 2. API Endpoint (`src/routes/emrRoutes.js` & `emrRecordController.js`)
- **Route**: `GET /api/emr/:id/verify-integrity`
- **Middleware**: Use existing `protect`, `authorize('patient', 'doctor')` or equivalent.
- **Controller**: Wrapper around `TamperEngine.verifyRecordIntegrity(id)`. Returns JSON with standard cryptographic metadata ONLY.

### 3. Test Suite (`scripts/test-tamper-engine.js`)
Implement a robust, isolated script to test all edge cases via direct database/blockchain manipulation:
1. Normal verification (V1 -> V2 -> V3 -> VERIFIED)
2. Diagnosis tampering (DB manipulation)
3. Symptoms tampering
4. Medication tampering
5. Vital signs tampering
6. Stored `integrityHash` tampering
7. Version rollback (DB V1, Chain V3)
8. Previous hash tampering
9. Pending anchor (DB V4, Chain V3)
10. Blockchain unavailable (Mock provider)
11. Missing anchor
12. Missing record
13. Assert zero PHI leakage in logs/API response.

## Verification Plan

### Automated Tests
- Run `node scripts/test-tamper-engine.js` which performs all 13 attack/state simulations.
- Re-run global regressions: `test-comprehensive.js` and `test-e2e-zkp.js` to ensure the new engine and API endpoints do not disrupt core EMR or ZKP flows.

## Open Questions

> [!WARNING]
> Retrieving the historical `version - 1` from the blockchain requires scanning the `integrityAnchors` array backward since there's no `O(1)` mapping by version in the contract. For EMRs with many updates, this scan may take a few extra RPC calls. I will implement a backward iteration up to the total anchor count. Since this is an audit operation, is this acceptable performance-wise?
