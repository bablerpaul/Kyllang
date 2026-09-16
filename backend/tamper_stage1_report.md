# Deterministic Canonicalization & Version-Aware Hashing Report

## 1. Existing Hash Implementation
The `dataHash` generation happens primarily in `src/modules/emr/emrRecordController.js`. It performs a shallow key sort and serializes using standard `JSON.stringify()`.
- **Function**: `crypto.createHash('sha256').update(recordJSON).digest('hex')`
- **Serialization**: `JSON.stringify(recordData, Object.keys(recordData).sort())`
- **Input Object**: An ad-hoc JSON dictionary constructed from `patient`, `doctor`, `diagnosis`, `symptoms`, `vitalSigns`, `allergies`, `medications`, `clinicalNotes`, `chiefComplaint`, `treatmentPlan`, `visitDate`.
- **Locations**: EMR Creation (Line 80) and EMR Update (Line 337).

## 2. Canonicalization
A new reusable standard was created in `src/utils/canonicalize.js` implementing a deterministic JSON structural representation similar to RFC 8785 (JCS):
- **Object Key Ordering**: Lexicographical, deep recursive sorting.
- **Nested Objects**: Handled correctly down to any depth.
- **Arrays**: Order strictly preserved, but elements are recursively canonicalized.
- **Null / Undefined**: `undefined` fields are deterministically stripped; `null` values are preserved.
- **Dates**: Converted strictly to ISO 8601 strings.
- **MongoDB ObjectIds**: Mongoose `ObjectId` instances are deterministically normalized to their 24-char hex strings.

## 3. EMR Integrity Payload
The logical EMR state protected by the tamper engine is defined in `buildIntegrityPayload(doc)`.
**Included**: `patient`, `doctor`, `diagnosis`, `symptoms`, `allergies`, `medications`, `vitals`, `vitalSigns`, `clinicalNotes`, `chiefComplaint`, `treatmentPlan`, `visitDate`, and `attachments` (containing `title`, `fileUrl`, `ipfsCid`, `fileHash`).
**Excluded**: Database transient fields (`_id`, `__v`), cryptographic components (`patientSalt`), encryption keys, and non-clinical metadata.

## 4 & 5. Versioning Design & Hash Linking
We introduced a temporal chain mechanism directly at the payload structural level:
```javascript
const payload = {
    data: emrData, // clinical state
    version: version, // incrementing integer (1, 2, 3...)
    previousHash: previousHash || null // SHA-256 of the prior state
};
const canonicalStr = canonicalize(payload);
const integrityHash = crypto.createHash('sha256').update(canonicalStr).digest('hex');
```
This forces any modification—even a legitimate one—to alter the hash while explicitly proving its lineage to the previously anchored state.

## 6. Database Schema
Modified `models/MedicalRecord.js` without removing or breaking `dataHash`.
Added three metadata fields:
- `integrityVersion`: `Number` (Default 1)
- `previousIntegrityHash`: `String` (Default null)
- `integrityHash`: `String`
Backward compatibility is fully maintained; `dataHash` continues to drive the legacy IPFS/blockchain functionality until the backend API cut-over is complete.

## 7-14. Tamper Simulation & Canonicalization Test Results
An extensive local test script (`scripts/test-canonicalization.js`) was created and executed successfully.

### Canonicalization

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Object key order | Same hash | Same hash | PASS |
| Nested object order | Same hash | Same hash | PASS |
| Array behavior | Deterministic | Order preserved (diff hashes) | PASS |
| Date serialization | Deterministic | Identical ISO string | PASS |
| Undefined handling | Deterministic | Undefined stripped | PASS |
| Null handling | Deterministic | Null preserved | PASS |

### Version Chain

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| New record | Version 1 | Version 1 | PASS |
| First update | Version 2 | Version 2 | PASS |
| Previous hash linkage | Correct | Correct | PASS |
| Second update | Version 3 | Version 3 | PASS |

### Tamper Tests

| Modification | Expected | Actual | Status |
|------|----------|--------|--------|
| Diagnosis | Hash changes | Hash changes | PASS |
| Symptoms | Hash changes | Hash changes | PASS |
| Medication | Hash changes | Hash changes | PASS |
| Visit date | Hash changes | Hash changes | PASS |
| Vital signs | Hash changes | Hash changes | PASS |
| Attachment metadata | Hash changes | Hash changes | PASS |

### Hash Collision Sanity Check
Generated 1,000 distinct clinical states.
- **Collision Sanity Check: PASSED**

## 16. Performance
Local benchmark testing showed that the deep recursive structure sorting does not induce a noticeable penalty.
- **Small EMR Hash Time:** 0.0145 ms
- **Large EMR (w/ 20 attachments, 5KB notes) Hash Time:** 0.1761 ms

## 17. Regression
The canonicalization foundation and Mongoose schema additions caused zero regression breaks.
- Full System E2E (EMR, Authentication, IPFS, Blockchain, QR, Consent): **PASS**
- Zero-Knowledge Groth16 Privacy Tests: **PASS**
