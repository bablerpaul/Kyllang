# Kyllang

**Zero-Trust Blockchain Medical Records System for Cryptographic Patient Sovereignty**

## 🌐 Overview
Kyllang fundamentally re-architects medical data storage by shifting control from centralized institutions directly to the patient. It provides a patient-controlled Electronic Medical Record (EMR) platform where every record is encrypted, anchored on-chain for tamper-proof authenticity, and accessible only via explicit cryptographic delegation. In critical situations, an emergency access mode allows life-saving data retrieval under strict auditability, ensuring a balance between absolute privacy and medical safety.

## 🚨 The Problem
Current EMR systems fail to protect patient privacy and suffer from severe interoperability issues. Data is siloed in centralized databases controlled by institutions, making it vulnerable to mass breaches, unauthorized internal access, and data tampering. Patients have no cryptographically verifiable way to prove ownership of their own health data, nor do they possess true sovereignty over who can access it across different healthcare providers.

## 🏗️ Architecture Philosophy
Kyllang is architected around a **zero-trust model**. The core assumption is that centralized infrastructure—including application servers, databases, and standard administrative users—cannot be trusted with raw plaintext medical data.

By pushing cryptographic sovereignty to the edges (the patient), Kyllang ensures that a compromised backend only yields opaque ciphertext. The server merely acts as a dumb relay and storage medium for encrypted blobs and cryptographic proofs. The trust boundary is drawn strictly at the user's client device.

## 🔐 Core Cryptographic Subsystems

### 1. TweetNaCl Integration
TweetNaCl provides the foundational asymmetric and symmetric cryptographic operations for the system.
- **Key Lifecycle:** Patients and doctors generate x25519 keypairs locally on their devices. The public keys are registered on-chain, acting as their sovereign identity.
- **Symmetric Encryption:** When a patient shares a record, a symmetric ephemeral key is used to encrypt the payload via `xsalsa20poly1305`. The symmetric key is then asymmetrically encrypted using the recipient's public key (via `crypto_box`), ensuring that only the designated doctor can decrypt the envelope.

### 2. Zero-Knowledge Proofs (ZKP)
To allow third parties (e.g., a pharmacy or a requesting hospital) to verify the authenticity of a medical certificate without exposing the entire patient history, the system employs Zero-Knowledge verification.
- **Mechanism:** Using `circom` and `snarkjs`, a ZKP is generated and verified. The verifier checks this proof against cryptographic hashes anchored on the blockchain. The verifier learns that the certificate is authentic and untouched, but learns absolutely nothing else about the patient's wider medical history.

### 3. AES-256-CBC and KMS Wrapping
Large static files (such as medical imagery or complex PDF reports) utilize AES-256-CBC with a lightweight Key Management Service (KMS) pattern.
- **Stream Processing:** To prevent memory exhaustion attacks during the encryption of large medical files, the system utilizes Node.js stream piping to encrypt and decrypt data on the fly.

## 🔗 Blockchain Integration
The boundary between on-chain and off-chain data is strictly maintained to optimize gas costs and preserve privacy.
- **Off-Chain:** All Personal Health Information (PHI), ciphertexts, and large diagnostic files are stored off-chain (e.g. routed through IPFS or decentralized storage), ensuring resilience against single points of failure.
- **On-Chain:** Smart contracts (Solidity) act as an immutable ledger of state and access rights, storing cryptographic hashes of the off-chain data. Comparing the hash of a retrieved document against the on-chain anchor mathematically proves the data has not been tampered with.

## 🛡️ Access Control Model
The system defines strict Role-Based Access Control (RBAC) boundaries spanning Patients, Doctors, and Administrators.
- **Patient Sovereignty:** The patient is the ultimate arbiter of their data, executing transactions that update the access control lists within the smart contract.
- **Emergency MCI Mode:** Break-glass functionality. In the event a patient is incapacitated, authorized emergency responders can trigger Emergency Access Mode. This temporarily bypasses the standard asymmetric decryption flow, utilizing a secure, audited secondary key escrow mechanism to decrypt life-saving data. Every invocation emits an immutable event on the blockchain.

## 💻 Project Structure
- **/backend**: Node.js/Express service designed for stateless operation and cryptographic relay, integrating ZKP verification and smart contract interactions.
- **/certificate-portal**: React + Vite frontend utilizing Material UI for a dark, high-contrast design. Meticulously manages local cryptographic state and surfaces Zero-Knowledge capabilities to the user securely.
- **/proxy-service**: Auxiliary services for bridging and handling specialized crypto evaluations.
- **/native-enclave**: Rust/Tauri-based enclave code for isolated native execution requirements.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- Git
- Local Ethereum Node (e.g. Ganache) or Testnet RPC
- `circom` installed for ZKP circuit compilation (if developing/modifying circuits)

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone https://github.com/bablerpaul/Kyllang.git
   cd Kyllang
   ```
2. **Install dependencies:**
   For the backend:
   ```bash
   cd backend
   npm install
   ```
   For the frontend:
   ```bash
   cd ../certificate-portal
   npm install
   ```
3. **Environment Variables:**
   - Copy `.env.example` to `.env` in both `backend` and `certificate-portal` directories and populate them with your localized settings (RPC URLs, database URIs, etc).
4. **Run the Application:**
   Start the backend and blockchain nodes, then start the frontend:
   ```bash
   # In backend
   npm run dev
   
   # In certificate-portal
   npm run dev
   ```

## 🤝 Contributing
We welcome contributions from the open-source and security research communities. Please review the contribution guidelines and ensure all code adheres to our strict cryptographic security standards before submitting a pull request.

## 📜 License
MIT License
