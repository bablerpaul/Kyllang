# Kyllang

**Zero-Trust Blockchain Medical Records System for Cryptographic Patient Sovereignty**

## 🌐 Executive Summary
Kyllang is a full-stack, blockchain-anchored Medical Certificate and Electronic Medical Record (EMR) portal. It features a hardened **v4 architecture** designed for decentralized trust, utilizing **Zero-Knowledge Proofs (ZKP)**, **Threshold Proxy Re-Encryption (TPRE)**, and **VRF-based key generation**.

Traditional EMR systems suffer from single points of failure, lack of cryptographic verifiability, browser-based memory volatility, and vulnerable deterministic key generation. Kyllang solves this by decentralizing trust, anchoring audit logs immutably (Merkle Roots on Ethereum/Ganache), and securing sessions via On-chain Escrow and Zero-Knowledge Proofs.

## 🚨 The Problem
Data is siloed in centralized databases controlled by institutions, making it vulnerable to mass breaches, unauthorized internal access, and data tampering. Patients have no cryptographically verifiable way to prove ownership of their own health data, nor do they possess true sovereignty over who can access it across different healthcare providers.

## 🏗️ Architecture & Core Components

### 1. Frontend (React 18 & Vite)
- Built with **React 18**, **Vite**, and **Material-UI** for a dark, institutional, high-contrast design.
- Uses **TweetNaCl** for in-browser cryptographic operations.
- Dedicated **ZK Web Workers** offload heavy cryptographic proofs to background threads, ensuring the UI remains highly responsive.
- Manages JWTs and localized cryptographic state meticulously.

### 2. Backend (Node.js & Express)
- **Node.js, Express.js, MongoDB (Mongoose)**, and **Ethers.js**.
- Acts as a stateless cryptographic relay and indexer rather than a traditional trusted server.
- Handles REST APIs, smart contract interactions, background batching (Merkle, Canary, Backup jobs), and TPRE Proxy Node management.

### 3. Blockchain (Ethereum/Ganache Smart Contracts)
- **`EMRRegistry.sol`**: Manages patient records and access control lists (ACLs).
- **`ZKVerifier.sol`**: On-chain verification of Zero-Knowledge proofs.
- **`EmergencyEscrow.sol`**: Manages Break-Glass MCI (Mass Casualty Incident) Emergency Mode with strict immutable audit logging.

### 4. Native Enclave (v4 Security)
- A **Tauri-based Rust sidecar** designed to protect against browser memory dumping.
- Manages keys in a secure native OS process utilizing `mlock` (memory locking) and key zeroization to prevent keys from leaking to disk or swap.

## 🔐 Cryptographic Subsystems

### TweetNaCl & VRF
Patients and doctors generate x25519 keypairs locally on their devices, with public keys registered on-chain as sovereign identities. Symmetric ephemeral keys (`xsalsa20poly1305`) encrypt payloads, which are then asymmetrically encrypted for the recipient.

### Zero-Knowledge Proofs (ZKP)
Allows third parties (e.g., a pharmacy) to verify the authenticity of a medical certificate without exposing the patient’s wider medical history. The verifier checks a proof generated via `circom` and `snarkjs` against on-chain cryptographic hashes.

### AES-256-CBC and KMS Wrapping
Large static files (e.g., medical imagery) utilize AES-256-CBC. A lightweight Key Management Service (KMS) pattern wraps these AES keys. Node.js stream piping is used to encrypt and decrypt data on the fly to prevent memory exhaustion attacks.

### Threshold Proxy Re-Encryption (TPRE)
Allows a decentralized set of proxy nodes to re-encrypt a patient's data for a doctor without ever seeing the plaintext data or the underlying private keys, preventing single-point server compromise.

## 💻 Repository Structure
```text
Kyllang/
├── backend/                  # Node.js Express backend and APIs
│   ├── contracts/            # Solidity smart contracts
│   ├── proxy-nodes/          # TPRE Proxy Node manager and VSS logic
│   ├── emergency/            # MCI Break-glass controllers
│   ├── jobs/                 # Background workers (Merkle, Canary, Backup)
│   └── events/               # Event emitters (Audit hash-chaining)
├── certificate-portal/       # React 18 Frontend
│   ├── src/workers/          # ZK Web Worker and Bridge for crypto offloading
│   ├── src/dashboard/        # Dashboard specific views
│   └── src/modules/          # Domain-specific modules (EMR)
└── native-enclave/           # Tauri (Rust) sidecar for secure key management
    └── src-tauri/src/crypto/ # mlock, zeroize, TPRE ops
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- Git
- Local Ethereum Node (e.g. Ganache) or Testnet RPC
- `circom` installed for ZKP circuit compilation (if developing/modifying circuits)
- Rust and Cargo (for compiling the Native Enclave)

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone https://github.com/bablerpaul/Kyllang.git
   cd Kyllang
   ```
2. **Install dependencies:**
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend
   cd ../certificate-portal && npm install
   ```
3. **Environment Variables:**
   - Copy `.env.example` to `.env` in both the `backend` and `certificate-portal` directories and configure your localized settings (RPC URLs, database URIs, etc).
4. **Run the Application:**
   ```bash
   # Start backend
   cd backend && npm run dev
   
   # Start frontend
   cd ../certificate-portal && npm run dev
   ```

## 🤝 Contributing
We welcome contributions from the open-source and security research communities. Please review the contribution guidelines and ensure all code adheres to our strict cryptographic security standards before submitting a pull request.

## 📜 License
MIT License
