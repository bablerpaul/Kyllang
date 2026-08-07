# Kyllang Architecture & Technical Specification

## 1. Architectural Philosophy
The Kyllang system is fundamentally architected around a zero-trust model for Electronic Medical Records (EMR). The core assumption is that centralized infrastructure—including the application servers, database instances, and standard administrative users—cannot be trusted with raw plaintext medical data. 

The threat model explicitly considers insider threats (malicious DB admins), infrastructure compromises (server breaches), and lateral movement attacks. By pushing cryptographic sovereignty to the edges (the patient), Kyllang ensures that a compromised backend only yields opaque ciphertext. The trust boundary is drawn strictly at the user's client device, meaning the server merely acts as a dumb relay and storage medium for encrypted blobs and cryptographic proofs.

## 2. Cryptographic Subsystems — In Depth

### TweetNaCl Integration
TweetNaCl provides the foundational asymmetric and symmetric cryptographic operations for the system. It is utilized to establish secure, authenticated channels between entities (patients and doctors) without relying on traditional PKI architectures that are vulnerable to centralized certificate authority compromises. 
- **Key Lifecycle**: Patients and doctors generate x25519 keypairs locally on their devices. The public keys are registered on-chain, acting as their sovereign identity. 
- **Symmetric Encryption**: When a patient shares a record, a symmetric ephemeral key is used to encrypt the payload via xsalsa20poly1305. The symmetric key is then asymmetrically encrypted using the recipient's public key (via crypto_box), ensuring that only the designated doctor can decrypt the envelope and access the underlying record.

### AES-256-CBC and KMS Wrapping
While TweetNaCl handles entity-to-entity communications, large static files (such as medical imagery or complex PDF reports) utilize AES-256-CBC. 
- **KMS Architecture**: A lightweight Key Management Service (KMS) pattern wraps these AES keys. The `encryptionService.js` module constructs a proprietary payload comprising a `MAGIC_BYTES` header (`KMS\x01`), a version length identifier, the version string, a 16-byte random IV, and the ciphertext. 
- **Stream Processing**: To prevent memory exhaustion attacks during the encryption of large medical files, the system utilizes Node.js stream piping to encrypt and decrypt data on the fly.

### HMAC Zero-Knowledge Proofs (ZKP)
To allow third parties (e.g., a pharmacy or a requesting hospital) to verify the authenticity of a medical certificate without exposing the entire patient history, the system employs an HMAC-based Zero-Knowledge verification concept. 
- **Mechanism**: The backend generates an HMAC over the certificate data. The verifier checks this HMAC against the cryptographic hash anchored on the blockchain. The verifier learns that the certificate is authentic and untouched, but learns absolutely nothing else about the patient's wider medical history. 

*(Note: Based on a rigorous audit of the current codebase, advanced experimental primitives such as Threshold Proxy Re-Encryption (TPRE), Verifiable Secret Sharing (VSS) with Pedersen Commitments, and VRF Tokens are NOT implemented in this iteration. The architecture relies on robust, proven asymmetric and symmetric primitives instead.)*

## 3. Blockchain Integration
The boundary between on-chain and off-chain data is strictly maintained to optimize gas costs and preserve privacy.
- **Off-Chain**: All Personal Health Information (PHI), ciphertexts, and large diagnostic files are stored off-chain. Specifically, large files are routed through IPFS, ensuring decentralized resilience against single points of failure.
- **On-Chain**: The smart contract acts as an immutable ledger of state and access rights. It stores cryptographic hashes of the off-chain data. By comparing the hash of a retrieved off-chain document against the on-chain anchor, clients can mathematically prove the data has not been tampered with. Patient IDs are heavily hashed before touching the chain to prevent correlation and chain-based deanonymization attacks.

## 4. Access Control Model
The system defines strict Role-Based Access Control (RBAC) boundaries spanning Patients, Doctors, and Administrators.
- **Patient Sovereignty**: The patient is the ultimate arbiter of their data. They execute transactions that update the access control lists within the smart contract.
- **Emergency MCI Mode**: A critical feature for medical systems is break-glass functionality. In the event a patient is incapacitated, authorized emergency responders can trigger Emergency Access Mode. This temporarily bypasses the standard asymmetric decryption flow, utilizing a secure, audited secondary key escrow mechanism to decrypt life-saving data. Every invocation of this mode emits an immutable event on the blockchain, guaranteeing total auditability and preventing silent abuse.

## 5. Backend Architecture
The backend is a Node.js/Express service designed for stateless operation and cryptographic relay.
- **Middleware Chain**: Requests pass through a rigorous middleware chain that enforces JWT validation, role checking, and payload sanitization before reaching the business logic.
- **MongoDB Schema**: The database acts merely as a highly available index and ciphertext store. The schema philosophy is designed around opacity: fields that could leak metadata are minimized. 
- **Cryptographic Isolation**: All cryptographic operations (KMS wrapping, HMAC generation) are strictly isolated in the `utils/cryptoUtils.js` and `utils/encryptionService.js` modules, preventing accidental key leakage in the standard controller logic.

## 6. Frontend Architecture
The client application is built with React and Vite, utilizing Material UI (MUI) for a dark, institutional, high-contrast design system.
- **State Management**: The frontend meticulously manages local cryptographic state. Keys are never transmitted to the backend in plaintext.
- **Crypto Surfacing**: Cryptographic operations are surfaced to the user via clear, non-technical UI elements (e.g., 'Zero-Knowledge Protected' badges), ensuring that users understand their security posture without needing a degree in cryptography.

## 7. Security Boundary Analysis
- **What it protects against**: Mass database exfiltration (attackers only get ciphertext), unauthorized insider access, silent modification of records (prevented by on-chain hashes), and central server compromise.
- **What it does NOT protect against**: Client-side malware (if a patient's device is compromised, their local keys are compromised), social engineering (tricking a patient into delegating access), and rubber-hose cryptanalysis. 
- **Trust Assumptions**: The system assumes the client device is secure, the blockchain network remains highly decentralized (preventing 51% attacks on the registry), and the underlying TweetNaCl and AES implementations remain mathematically sound.

## 8. Why Kyllang Is a Step Change
Conventional EMR systems rely entirely on trust-the-server assumptions. They implement perimeter security, but once inside, the data is soft, plaintext, and ripe for mass exfiltration. Kyllang fundamentally flips this paradigm. By enforcing cryptographic sovereignty, eliminating centralized key escrow (outside of strictly audited emergency modes), and proving data integrity via blockchain anchoring, it provides a novel architecture that solves the privacy and interoperability crises plaguing modern healthcare. It is not just an incremental update to legacy systems; it is a structural redesign of how medical data is owned and shared.
