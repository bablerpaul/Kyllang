# Kyllang
**Zero-Trust Blockchain Medical Records System for Cryptographic Patient Sovereignty**

## The Problem
Current electronic medical record (EMR) systems fail to protect patient privacy and suffer from severe interoperability issues. Data is siloed in centralized databases controlled by institutions, making it vulnerable to mass breaches and unauthorized internal access. Patients have no cryptographically verifiable way to prove ownership of their own health data, nor do they possess true sovereignty over who can access it across different healthcare providers.

## What Kyllang Does
Kyllang fundamentally re-architects medical data storage by shifting control from centralized institutions directly to the patient. It provides a patient-controlled EMR platform where every record is encrypted, anchored on-chain for tamper-proof authenticity, and accessible only via explicit cryptographic delegation. In critical situations, an emergency access mode allows life-saving data retrieval under strict auditability, ensuring a balance between absolute privacy and medical safety.

## Core Capabilities
* **Patient-Controlled Access:** Patients cryptographically delegate and revoke access to their medical records in real-time.
* **On-Chain Anchoring:** Record metadata and cryptographic hashes are anchored to the blockchain, providing immutable proof of authenticity.
* **Decentralized Storage Integration:** Large medical files are encrypted and stored via decentralized networks (IPFS), preventing centralized data honeypots.
* **Instant Verification:** Medical certificates and prescriptions can be publicly verified by hospitals using zero-knowledge proofs without exposing underlying record data.
* **Emergency Access Mode:** Break-glass functionality allows authorized medical responders to access critical data during emergencies, with full on-chain audit trails.
* **Granular Role Management:** Distinct access boundaries for patients, doctors, and administrators enforced at the cryptographic level.

## Cryptographic Architecture (Plain English)
Kyllang utilizes a robust suite of cryptographic primitives to secure medical data. **Zero-Knowledge Proofs (ZKPs)** are leveraged during certificate verification; this allows a verifier (like a hospital or pharmacy) to confirm a document is authentic and unmodified without the system needing to reveal any surrounding patient history. **TweetNaCl** provides state-of-the-art, high-speed public-key authenticated encryption, ensuring that data moving between the patient and the provider remains confidential and tamper-proof. Together, these technologies ensure that medical data remains opaque to everyone except those explicitly granted the keys.

## Who This Is For
* **Patients:** Seeking absolute control and privacy over their health history.
* **Hospitals & Clinics:** Requiring secure, interoperable, and verifiable patient records.
* **Auditors & Researchers:** Needing cryptographically assured data integrity without accessing personally identifiable information.

## Getting Started
1. Clone the repository to your local machine.
2. Install the necessary dependencies for both the backend and frontend services.
3. Configure your local environment variables according to the provided `.env.example` templates.
4. Run the development servers to initialize the blockchain network, backend API, and user interface.

## Contributing
We welcome contributions from the open-source and security research communities. Please review the contribution guidelines and ensure all code adheres to our strict cryptographic security standards before submitting a pull request.

## License
MIT License

