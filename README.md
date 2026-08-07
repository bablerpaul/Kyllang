# Kyllang

Kyllang is a full-stack, blockchain-anchored Medical Certificate and Electronic Medical Record (EMR) portal. It introduces a hardened architecture for decentralized trust, leveraging advanced cryptographic primitives such as Zero-Knowledge Proofs (ZKP), Threshold Proxy Re-Encryption (TPRE), and Verifiable Random Function (VRF)-based key generation. 

Traditional EMR systems are historically plagued by centralized single points of failure, absence of robust cryptographic verifiability, exposure to browser-based memory volatility, and vulnerable deterministic key generation strategies. Kyllang addresses these systemic flaws by fully decentralizing trust through TPRE, immutably anchoring continuous audit logs via Merkle Roots synchronized on a local EVM-compatible chain, and securing stateful sessions using a combination of on-chain escrow mechanisms and ZKP verification.

## Core Architectural Components

### Cryptographic Offloading and Secure Execution
The architecture ensures that sensitive cryptographic operations are strictly isolated from the primary browser thread. Web Workers are employed to handle computationally heavy ZKP generation and verification, ensuring that the main execution thread remains non-blocking while handling elliptic curve operations. 

To mitigate the inherent risks of memory dumping and volatile key storage in the browser sandbox, Kyllang integrates a Native Enclave. This sidecar runs as a privileged process written in Rust, leveraging operating system-level memory locking (`mlock`) to prevent paging sensitive key material to disk. Furthermore, cryptographic keys are subjected to deterministic zeroization immediately post-operation, ensuring a minimized attack surface against local privilege escalation or memory scraping attacks.

### Threshold Proxy Re-Encryption (TPRE)
Medical record sharing and delegation of access rights are orchestrated via a Threshold Proxy Re-Encryption network. This allows data owners to issue re-encryption keys to a decentralized network of proxy nodes. These nodes can transform ciphertexts encrypted under the data owner's public key into ciphertexts decryptable by authorized third parties (such as specialists or insurance providers) without ever exposing the underlying plaintext or the owner's private key. The threshold nature of the network guarantees that no single proxy node can collude or compromise the data integrity, requiring a quorum to perform the transformation.

### Immutability and Auditability
Data integrity and temporal verifiability are achieved through continuous blockchain anchoring. The backend continuously aggregates system events, audit logs, and EMR mutation state changes, constructing a Merkle Tree. The periodic roots of this tree are committed to an Ethereum-compatible local chain using dedicated smart contracts (`EMRRegistry.sol` and `ZKVerifier.sol`). This cryptographic anchoring guarantees that historical states cannot be retroactively mutated, providing robust, cryptographically verifiable proof of record provenance and access logs.

### Emergency Escrow Mechanisms
In life-critical "break-glass" scenarios (e.g., Mass Casualty Incidents), Kyllang implements an emergency access protocol governed by an on-chain `EmergencyEscrow.sol` smart contract. This system utilizes time-locks and ZK-based multi-signature authorizations to grant temporary, scoped access to vital medical records when the primary patient cannot provide explicit cryptographic consent, balancing strict data privacy with life-saving data accessibility.

## Technical Stack Overview
- **Cryptographic Operations:** TweetNaCl, Custom ZK-SNARK constructs.
- **Frontend Interfacing:** React, Vite, utilizing dedicated Web Workers for thread isolation.
- **Backend Orchestration:** Node.js, Express.js for RESTful API provisioning and background batching, interfacing with MongoDB for high-throughput state storage.
- **Blockchain Layer:** Ethers.js for Web3 RPC communication, interacting with Solidity-based smart contracts deployed on a local EVM testnet.
- **Secure Enclave:** Rust, Tauri framework for native OS integration and secure memory management (`mlock`).

## Key Innovations
1. **Decentralized Authorization:** Moving away from standard JWT/OAuth central authorities to purely cryptographic, math-backed access control.
2. **Sidecar Key Management:** Bypassing browser security limitations with a dedicated, memory-safe native enclave for key operations.
3. **ZK-Driven Sessions:** Validating user session state and permissions without transmitting underlying secrets over the wire.
