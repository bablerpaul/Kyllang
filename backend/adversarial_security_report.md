# TASK 5F: Adversarial Security & Tamper Detection Assessment

## 1. Attack Methodology
An adversarial security assessment was conducted against the Kyllang Tamper Detection Engine and its corresponding `EMRRegistry.sol` smart contract. The methodology involved evaluating the system against 20 specific attack vectors, assuming an attacker with varying degrees of access ranging from "Database-Only" to "Database + Server Runtime". 

The assessment focused on state divergence between MongoDB and the blockchain, hash chain continuity, versioning logic, file integrity, and cryptographic commitment bindings.

## 2. Tests Performed & Results (Security Property Table)

| Attack | Expected | Actual | Status |
|---|---|---|---|
| Diagnosis modification | DETECT | DETECT | PASS |
| Symptoms modification | DETECT | DETECT | PASS |
| Medication modification | DETECT | DETECT | PASS |
| Hash forgery | DETECT | DETECT | PASS |
| Rollback | DETECT | DETECT | PASS |
| Previous hash forgery | DETECT | DETECT | PASS |
| Unauthorized anchor | REJECT | REJECT | PASS |
| Cross-record reuse | REJECT | REJECT | PASS |
| Version skipping | REJECT | **VERIFIED** | **FAIL (CRITICAL)** |
| Duplicate version | REJECT | REJECT | PASS |
| Blockchain outage | NON-TAMPER | NON-TAMPER | PASS |
| Pending anchor | PENDING | PENDING | PASS |
| Attachment modification | DETECT | **VERIFIED** | **FAIL (CRITICAL)** |
| Concurrency conflict | REJECT/RETRY | REJECT | PASS |
| Replay | REJECT | REJECT | PASS |

## 3. Vulnerabilities Discovered

During the assessment, two critical vulnerabilities were discovered that allow an attacker to successfully bypass the Tamper Detection Engine. As per the security directives, **these have NOT been silently patched.**

### VULNERABILITY 1: Blockchain Version Skipping & Hash Chain Severance (CRITICAL)
**The Flaw:**
In `EMRRegistry.sol`, the version enforcement check uses a greater-than operator rather than a sequential increment:
```solidity
require(_version > latestRecordVersion[_recordCommitment], "Version must strictly increase");
```
Additionally, `TamperEngine.js` verifies the hash chain by requesting `dbVersion - 1` from the blockchain and comparing it to the local `previousIntegrityHash`. It never explicitly queries the latest anchor on the blockchain to verify its `previousHash` field matches the chain.

**How it is Exploited:**
1. An attacker (with runtime access) anchors `V1` to the blockchain.
2. The attacker intentionally skips `V2` and anchors `V3` to the blockchain with `_previousHash = HASH_V1`. The smart contract allows this because `3 > 1`.
3. In MongoDB, the attacker creates a forged `V3` payload and sets `previousIntegrityHash = "0x0000000000000000000000000000000000000000000000000000000000000000"`.
4. When `TamperEngine` attempts to verify this record, it queries the blockchain for `V2` (`dbVersion - 1`). Since `V2` doesn't exist, the smart contract returns an empty struct filled with zeroes.
5. `TamperEngine` normalizes the zeroes and compares them against the database's `previousIntegrityHash` (which the attacker also set to zeroes). **The check passes.**
6. `TamperEngine` then computes `HASH_V3` using the zeroed previous hash, matches it against the latest blockchain state (`V3`), and incorrectly reports `INTEGRITY_VERIFIED`.

**Safest Fix:**
1. **Smart Contract:** Modify `EMRRegistry.sol` to enforce strict sequential versioning: 
   `require(_version == latestRecordVersion[_recordCommitment] + 1, "Version must strictly increase sequentially");`
2. **Backend Engine:** Update `TamperEngine.js` to retrieve the full `IntegrityAnchor` for the current version and assert that `anchor.previousHash === computedPrevChainHash`.

---

### VULNERABILITY 2: Blindness to Physical Attachment Replacement (CRITICAL)
**The Flaw:**
The current `TamperEngine.js` logic only performs canonicalization and hashing on the MongoDB JSON payload:
```javascript
const payload = buildIntegrityPayload(record);
const calculatedHash = generateIntegrityHash(payload, record.integrityVersion || 1, ...);
```
While `fileHash` and `ipfsCid` are protected *within the database record*, the engine never actually checks the physical files residing on the disk/IPFS.

**How it is Exploited:**
1. An attacker gains access to the physical disk (`uploads/emr/` directory) or local IPFS node.
2. The attacker replaces a legitimate medical attachment (`file-12345.pdf`) with a malicious forged file.
3. The attacker leaves the MongoDB record untouched.
4. When `verifyRecordIntegrity()` is called, it only re-hashes the database state. Since the database hasn't changed, it reports `INTEGRITY_VERIFIED`, even though the underlying file has been entirely replaced.

**Safest Fix:**
1. Enhance `TamperEngine.js` to execute a streaming integrity check of physical files. 
2. For each attachment in the EMR, open a `fs.createReadStream()` (or IPFS equivalent), pipe it through a SHA-256 hash generator, and assert that the physical file hash matches the database's `fileHash`.

## 4. Existing Protections & Remaining Limitations

**Existing Protections:**
- **Zero PHI Leakage:** Tested and confirmed. The engine natively decrypts KMS fields strictly for hashing without exposing plaintext in APIs or logs.
- **Rollback Protection:** Successfully detects if MongoDB is restored to an older backup while the blockchain is further ahead.
- **Record Commitment:** Cryptographically decouples the MongoDB `_id` from the blockchain anchor, preventing cross-record pollution.

**Remaining Trust-Boundary Limitations:**
If an attacker compromises both the database and the server execution environment (specifically the `MASTER_ENCRYPTION_KEY`), they become effectively indistinguishable from the legitimate application. They can generate valid Record Commitments, encrypt new malicious data, generate matching hashes, and sign fraudulent transactions directly to the blockchain. The Tamper Engine cannot protect against a fully compromised runtime environment.

## 5. Security Maturity Assessment
The core cryptographic structures (canonicalization, hashing, commitment) are solid, but the implementation lacks critical enforcement barriers. The system is currently at **Maturity Level 2 (Reactive Integrity)**. Once the version-skipping logic and physical attachment validations are patched, the system will achieve **Maturity Level 3 (Hardened Provable Integrity)**.

**Action Required:** I have stopped further architectural changes as requested. Please review these vulnerabilities and provide approval to implement the recommended fixes in the Smart Contract and Backend Engine.
