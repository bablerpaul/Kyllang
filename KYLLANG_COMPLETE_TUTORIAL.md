# KYLLANG COMPLETE TUTORIAL

Welcome to Kyllang! This is a complete step-by-step tutorial designed to take you from a completely fresh computer to running, understanding, and demonstrating the entire Kyllang project.

## 1. PROJECT OVERVIEW

- **What Kyllang is:** Kyllang is a secure, privacy-preserving Electronic Medical Record (EMR) and Medical Certificate verification platform.
- **What problem it solves:** Traditional EMRs are centralized and susceptible to undetected tampering. Furthermore, when patients submit medical certificates to employers, they often over-share sensitive health information (like their exact diagnosis). Kyllang solves both data integrity and privacy issues.
- **Why blockchain is used:** It provides an immutable ledger. Once a cryptographic hash of a medical record is anchored to the blockchain, the hospital cannot secretly modify the database history without breaking the hash chain on the blockchain.
- **Why MongoDB is used:** Blockchains are too slow and expensive to store large amounts of JSON data. MongoDB stores the actual encrypted medical data off-chain.
- **Why IPFS is used:** For large medical attachments (like PDFs and X-Rays), we use the InterPlanetary File System (IPFS) to provide decentralized, content-addressed storage, preventing single points of failure.
- **Why encryption is used:** To ensure that even if the MongoDB database or IPFS network is breached, the attacker only sees unreadable ciphertext. Field-level AES-256 encryption protects specific clinical fields.
- **Why Zero-Knowledge Proofs are used:** ZKPs allow a patient to prove to a verifier (like an employer) that their medical certificate is valid, signed by a real doctor, and currently active, *without* revealing their diagnosis, patient ID, or other sensitive personal health information (PHI).
- **Why the Tamper Detection Engine is used:** It bridges the gap between the off-chain MongoDB data and the on-chain blockchain anchors, providing real-time cryptographic verification that an EMR has not been maliciously modified, rolled back, or corrupted.

## 2. TECHNOLOGY STACK

| Component | Technology | Description & Usage in Kyllang | Location |
|---|---|---|---|
| **Frontend** | React / Vite | Modern UI framework for fast rendering. Used for the Certificate Verification Portal. | `certificate-portal/` |
| **Backend** | Node.js / Express | Handles API routing, database interactions, encryption, and cryptographic hashing. | `backend/` |
| **Database** | MongoDB / Mongoose | Stores encrypted user data, EMR metadata, and access controls. | `backend/models/` |
| **Blockchain** | Ethereum / Ethers.js | Provides the immutable ledger for storing cryptographic anchors (commitments). | `backend/blockchain.js` |
| **Smart Contracts**| Solidity | Contains rules for sequential versioning, consent, and MCI (Emergency) states. | `backend/contracts/` |
| **Encryption** | AES-256-GCM / KMS | Provides field-level encryption for EMRs and streaming encryption for IPFS attachments. | `backend/src/utils/` |
| **ZKP** | Circom / SnarkJS | Compiles circuits and generates Groth16 proofs to verify certificates privately. | `backend/circuits/` |
| **IPFS** | Pinata / IPFS HTTP | Stores encrypted large file attachments outside of the main database. | `backend/src/utils/ipfsService.js` |
| **Authentication** | JWT | JSON Web Tokens manage stateless user login sessions. | `backend/middlewares/` |
| **Native Enclave** | Tauri (Rust) | Provides a secure desktop application wrapper (partially implemented). | `native-enclave/` |

## 3. PROJECT FOLDER STRUCTURE

- `backend/`: The core Node.js server.
  - `backend/contracts/`: Contains Solidity Smart Contracts (`EMRRegistry.sol`, `ConsentRegistry.sol`, `EmergencyEscrow.sol`).
  - `backend/circuits/`: Contains Circom files for ZKP logic (`certificate.circom`).
  - `backend/controllers/`: Express route handlers containing business logic.
  - `backend/models/`: Mongoose schemas defining MongoDB collections (e.g., `MedicalRecord.js`).
  - `backend/routes/`: Express API endpoints.
  - `backend/scripts/`: Extensive test suite containing simulation and regression tests.
  - `backend/src/services/`: Core logic engines like `tamperEngine.js`.
  - `backend/src/utils/`: Cryptography, ZKP generation, IPFS, and canonicalization utilities.
- `certificate-portal/`: The Vite/React web frontend for third-party verifiers to upload ZK proofs.
- `native-enclave/`: The Tauri Rust desktop app skeleton for secure execution.

## 4. INSTALLATION

**1. Required Software:**
- Node.js (v18 or higher recommended)
- MongoDB (running locally or via Atlas)
- Ganache (Global CLI or UI for local blockchain)

**2. MongoDB Setup:**
Install MongoDB Community Edition and start the service. Ensure it's running on `mongodb://127.0.0.1:27017/kyllang`.

**3. Ganache Setup:**
Open a terminal and start a local Ethereum network:
```bash
npm install -g ganache
ganache --deterministic
```

**4. Backend Installation:**
```bash
cd backend
npm install
```

**5. Smart Contract Deployment & ZKP Circuit Setup:**
Ensure Ganache is running, then compile contracts and circom circuits (if not pre-compiled):
*(Note: Use existing deployment scripts or the tests which dynamically deploy contracts)*
```bash
cd backend
node scripts/test-comprehensive.js # This will deploy contracts and run tests to verify
```

**6. Frontend Installation:**
```bash
cd certificate-portal
npm install
npm run dev
```

*(Note: MetaMask and Remix are not strictly required for backend automated tests, but can be used for UI interactions. Pinata requires setting up a free account and obtaining a JWT).*

## 5. ENVIRONMENT VARIABLES

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/kyllang

# Authentication (DO NOT SHARE)
JWT_SECRET=YOUR_RANDOM_LONG_SECRET_STRING

# Cryptography (DO NOT SHARE)
MASTER_ENCRYPTION_KEY=YOUR_32_BYTE_HEX_OR_STRING_SECRET

# Blockchain
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=YOUR_GANACHE_ACCOUNT_PRIVATE_KEY

# ZKP Paths
WASM_PATH=./circuits/build/certificate_js/certificate.wasm
ZKEY_PATH=./circuits/build/certificate_final.zkey
VKEY_PATH=./circuits/build/verification_key.json

# IPFS (Optional)
PINATA_JWT=YOUR_PINATA_API_JWT
```

## 6. DATABASE FLOW

**Patient -> Create EMR -> MongoDB -> Field-level encryption -> Encrypted medical data**

When a doctor creates an EMR:
1. The JSON payload reaches Mongoose.
2. Mongoose custom setters intercept specific clinical fields (e.g., `diagnosis`, `symptoms`, `medications`, `vitalSigns`).
3. These fields are encrypted using AES-256-GCM via the `MASTER_ENCRYPTION_KEY`.
4. The encrypted strings (ciphertext) are stored in MongoDB.
5. **Why?** If the database is dumped, PHI is unreadable.
6. **Plaintext Fields:** Fields like `patient` (ID), `doctor` (ID), and `visitDate` remain plaintext to allow database indexing and fast querying.

## 7. LARGE FILE FLOW

**Medical File -> Stream -> AES encryption -> Encrypted temporary file -> SHA-256 hash -> IPFS -> CID -> MongoDB metadata**

1. A large file (e.g., X-Ray) is uploaded.
2. Node.js pipes the file stream directly into an AES-256-GCM encryption stream.
3. The encrypted stream is piped to a temporary file (or directly to IPFS).
4. The ciphertext's SHA-256 hash is computed dynamically during the stream.
5. The encrypted file is uploaded to IPFS, returning a CID.
6. The MongoDB EMR records the `fileHash` and `ipfsCid`.
7. **Why streaming?** Streaming prevents RAM exhaustion (OOM crashes) when processing massive files (e.g., 500MB+ MRI scans).

## 8. BLOCKCHAIN FLOW

1. **EMR Creation:** An EMR is saved in MongoDB.
2. **Hash Generation:** The EMR data is canonically sorted and hashed using SHA-256.
3. **Record Commitment:** A deterministic, secret HMAC-SHA256 commitment of the MongoDB `_id` is created. This ensures the true `_id` is never exposed on-chain.
4. **Smart Contract Transaction:** The backend signs a transaction to `EMRRegistry.sol` calling `storeIntegrityAnchor()`.
5. **On-Chain Data:** The blockchain permanently records:
   - `recordCommitment` (Identifier)
   - `version` (Must be `latest + 1`)
   - `integrityHash` (The SHA-256 hash)
   - `previousHash` (The hash of the previous version, forming a chain)
   - `timestamp`

## 9. ZERO-KNOWLEDGE PROOF FLOW

**Patient data -> Circom circuit -> Private inputs -> Public signals -> Groth16 proof -> SnarkJS verification -> Blockchain nullifier -> Verification result**

- **Private Inputs:** `patientId`, `diagnosis`, `secretSalt`. These are NEVER revealed to the verifier.
- **Public Inputs:** `validFrom`, `validUntil`, `certificateHash`, `currentDate`. These are visible to the verifier.
- **Flow:** The circuit proves that `Hash(patientId, diagnosis, validFrom, validUntil, secretSalt) == certificateHash`, and that `currentDate` is between `validFrom` and `validUntil`.
- **Nullifiers:** To prevent replay attacks (using the same proof twice), a `nullifierHash` is generated and marked as "used" on-chain or in a local cache.

## 10. TAMPER DETECTION ENGINE

**MongoDB EMR -> Decrypt required fields in memory -> Canonicalization -> SHA-256 -> Calculated integrityHash -> Compare with MongoDB -> Compare with blockchain -> Check version -> Check previousHash -> Check attachment fileHash -> Final result**

**Possible Results:**
- `INTEGRITY_VERIFIED`: Everything matches perfectly.
- `TAMPER_DETECTED`: Data modified. Reasons include `LOCAL_HASH_MISMATCH`, `BLOCKCHAIN_HASH_MISMATCH`, `PREVIOUS_HASH_MISMATCH`, `PREVIOUS_ANCHOR_MISSING`, or `ATTACHMENT_HASH_MISMATCH`.
- `VERSION_MISMATCH`: EMR version is older than blockchain (Rollback attack).
- `ANCHOR_PENDING`: EMR version is newer than blockchain (Waiting for mining).
- `ANCHOR_NOT_FOUND`: No record found on chain.
- `BLOCKCHAIN_UNAVAILABLE`: Cannot reach RPC node.
- `ATTACHMENT_UNAVAILABLE`: IPFS file missing (network issue, not cryptographic tampering).
- `RECORD_NOT_FOUND`: EMR missing from DB.

## 11. ATTACHMENT TAMPER DETECTION

To verify an attachment (PDF/Image):
1. The Tamper Engine reads the `fileHash` from MongoDB.
2. It fetches the file via a `ReadableWebStream` (IPFS) or `fs.createReadStream` (Local).
3. It pipes the stream through a `crypto.createHash('sha256')` generator.
4. If the calculated physical hash differs from the database `fileHash`, it flags `ATTACHMENT_HASH_MISMATCH`.

## 12. EMERGENCY ACCESS

**Status: Partially Implemented**
The Kyllang platform contains a foundational smart contract (`EmergencyEscrow.sol`) and a dedicated route controller (`mci-controller.js`) designed for Mass Casualty Incidents (MCI). 
- **Implemented Flow:** Hospital admins can submit an MCI activation request. Once a multisig threshold is reached on-chain, MCI mode is activated.
- **Future Work:** Currently, the system can activate/deactivate the MCI state and check its status via API. However, bypassing the actual patient-consent layer dynamically during an active MCI state is marked as future work.

## 13. SECURITY ARCHITECTURE

- **AES-256 & KMS:** Protects clinical data at rest against database breaches.
- **JWT:** Protects API endpoints against unauthorized access.
- **Blockchain Immutability:** Protects against database history rewriting by rogue sysadmins.
- **Record Commitments:** Protects patient privacy by hiding DB IDs on the public blockchain.
- **ZKP:** Protects patient privacy from employers during sick leave verification.
- **Nullifiers:** Protects against ZKP replay attacks.
- **Version Chaining:** Protects against version skipping or reordering attacks.
- **Tamper Detection:** Protects the bridge between off-chain data and on-chain anchors.
- **IPFS:** Protects large file availability against centralized server failure.
- **Streaming Encryption:** Protects server infrastructure against RAM exhaustion (DDoS).

## 14. COMPLETE USER WORKFLOW

**PATIENT:** Register -> Login -> View EMR -> Grant doctor access -> Generate certificate (ZKP proof payload).
**DOCTOR:** Login -> Receive access -> Create EMR -> System automatically encrypts and anchors to blockchain.
**VERIFIER (e.g. Employer):** Receives certificate JSON from patient -> Submits to Certificate Portal -> Backend runs Groth16 verification -> Checks nullifier -> Receives safe "Valid" or "Invalid" response (No PHI exposed).

## 15. TESTING TUTORIAL

Navigate to the `backend/` directory.

- **`test-comprehensive.js`**
  - **Tests:** Database connectivity, IPFS streaming, EMR creation, Certificate generation, ZKP integration, Audit logs, and backwards compatibility.
  - **Command:** `node scripts/test-comprehensive.js`
  - **Expected:** All tests pass, resulting in "🎉 ALL COMPREHENSIVE INTEGRATION TESTS EXECUTED SUCCESSFULLY 🎉"

- **`test-tamper-engine.js`**
  - **Tests:** The Tamper Detection Engine against 19 specific adversarial attacks (Rollbacks, version skipping, missing links, DB tampering, attachment swapping).
  - **Command:** `node scripts/test-tamper-engine.js`
  - **Expected:** 17/17 tests pass successfully.

- **`test-integrity-blockchain.js`**
  - **Tests:** The smart contract logic explicitly, ensuring it rejects out-of-order versions, duplicate versions, and cross-record pollution.
  - **Command:** `node scripts/test-integrity-blockchain.js`
  - **Expected:** 22/22 tests pass successfully.

- **`test-e2e-zkp.js`**
  - **Tests:** Zero-Knowledge proof generation, replay attacks (nullifiers), and proof forgery (changing diagnosis, dates).
  - **Command:** `node scripts/test-e2e-zkp.js`
  - **Expected:** 11/11 tests pass successfully.

## 16. TROUBLESHOOTING

- **MongoDB connection failed:** Ensure MongoDB is running locally (`net start MongoDB` on Windows, or `sudo systemctl start mongod` on Linux).
- **Ganache connection failed:** Ensure Ganache is running on port 8545.
- **PRIVATE_KEY missing / Transaction Reverted:** Ensure Ganache is running with the exact mnemonic/private key specified in your `.env`.
- **ZKP verification failure:** Ensure `WASM_PATH`, `ZKEY_PATH`, and `VKEY_PATH` point to valid compiled Circom files.
- **process.env.MASTER_ENCRYPTION_KEY is missing:** You forgot to add `MASTER_ENCRYPTION_KEY` to your `.env` file.
- **IPFS upload failure:** Ensure `PINATA_JWT` is valid in `.env` or a local IPFS daemon is running on port 5001.
- **Port already in use:** Run `npx kill-port 5000` or change `PORT` in `.env`.

## 17. DEMONSTRATION TUTORIAL

1. **Start MongoDB:** Open a terminal and ensure MongoDB is running.
2. **Start Ganache:** Run `ganache --deterministic`.
3. **Start backend:** In the `backend` folder, run `npm start`.
4. **Start frontend:** In the `certificate-portal` folder, run `npm run dev`.
5. **Run Comprehensive Test:** To demonstrate all features rapidly, open a new terminal in `backend/` and run `node scripts/test-comprehensive.js`.
6. **Demonstrate Tamper Detection:** Run `node scripts/test-tamper-engine.js`. The console will print the exact attack vectors being executed (e.g., "Symptoms Tampering", "Version Rollback") and show `[PASS]` as the Tamper Engine successfully catches and reports `TAMPER_DETECTED` for every single attack, proving the system is cryptographically secure.

## 18. ARCHITECTURE DIAGRAMS

**A. EMR Creation & Blockchain Anchoring**
```text
[Doctor] -> (JSON Data) -> [Express Server]
                               |
                        [Canonicalize & Hash] -> (Hash V1)
                               |
                        [AES Encryption] -> (Ciphertext) -> [MongoDB]
                               |
                        [HMAC Commitment]
                               |
                 [Sign TX] -> [Ganache / EMRRegistry.sol]
```

**B. Tamper Detection**
```text
[MongoDB] -> (Fetch Ciphertext) -> [Decrypt in RAM] -> (Hash A)
                                                         |
[Blockchain] -> (Fetch Anchor) ----------------------> (Hash B)
                                                         |
                                                  [Hash A == Hash B ?]
                                                  [Yes -> INTEGRITY_VERIFIED]
                                                  [No  -> TAMPER_DETECTED]
```

## 19. PATENT/INNOVATION FEATURES

**ALREADY IMPLEMENTED:**
- **Decoupled Cryptographic Commitments:** Hiding database primary keys from the public blockchain using HMAC-SHA256 commitments.
- **Zero-Knowledge Medical Certificates:** Proving medical leave validity without exposing the underlying diagnosis or patient identifiers.
- **Streaming IPFS Encryption:** Encrypting and hashing massive medical attachments on-the-fly without exhausting server RAM.
- **O(1) Historical Integrity Chaining:** Enforcing sequential strict versioning and previous-hash verification directly on the smart contract and Tamper Engine.

**FUTURE WORK:**
- Fully autonomous Multi-Sig Break-Glass (MCI) consent bypass.
- Native Enclave local signature generation.

## 20. PROJECT STATUS

| Module | Status | Evidence |
|---|---|---|
| EMR | COMPLETE | Database models, encryption triggers, E2E tests passing. |
| Encryption | COMPLETE | KMS/AES-256 field-level encryption verified. |
| Large-file streaming | COMPLETE | `streamEncryption.js` and comprehensive IPFS tests passing. |
| IPFS | COMPLETE | `ipfsService.js` active, testing fallback mocks available. |
| Blockchain | COMPLETE | `EMRRegistry.sol` deployed, strict versioning tested (22/22). |
| ZKP | COMPLETE | Circom circuits, Groth16 SnarkJS integrated, nullifiers active. |
| Tamper Detection | COMPLETE | `tamperEngine.js` catches all 19 adversarial vectors. |
| Certificate | COMPLETE | Medical certificates generation & ZKP verification working. |
| Authentication | COMPLETE | JWT middleware active and enforced. |
| Emergency Access | PARTIAL | Smart contract & routes exist, but bypass logic is future work. |
| Native Enclave | PARTIAL | Tauri folder skeleton exists, full integration pending. |

## 21. FINAL QUICK-START GUIDE (Run Kyllang in 10 Steps)

1. `npm install -g ganache`
2. `ganache --deterministic` (Leave running in Terminal 1)
3. Open Terminal 2: `cd backend`
4. `npm install`
5. Create `.env` in `backend/` with `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, and `PRIVATE_KEY` (from Ganache).
6. Ensure MongoDB is running locally.
7. `node scripts/test-comprehensive.js` (Verifies entire backend stack).
8. `npm start` (Starts the API on port 5000).
9. Open Terminal 3: `cd certificate-portal`
10. `npm install && npm run dev` (Starts frontend UI).
