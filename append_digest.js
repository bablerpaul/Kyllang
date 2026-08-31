const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'CODEBASE_DIGEST_FOR_GEMINI.md');

let markdown = `\n## SECTION 5: Runtime Outputs & Execution Telemetry\n\n`;

markdown += `### 1. Proof Generation (Frontend Worker)\n`;
markdown += `- **Input:** \`{ patientId, diagnosis, date, secretSalt }\`\n`;
markdown += `- **Output:** ZK-SNARK Proof \`{ pi_a, pi_b, pi_c, protocol }\` and Public Signals \`[public_hash]\`\n`;
markdown += `- **Telemetry:** Emits \`[Worker] Proof generation complete in XX ms\`.\n\n`;

markdown += `### 2. Smart Contract Verification (Verifier.sol)\n`;
markdown += `- **Input:** \`pi_a\`, \`pi_b\`, \`pi_c\`, \`pubSignals\`\n`;
markdown += `- **Output:** Boolean (true if valid, false otherwise)\n`;
markdown += `- **Events:** \`VerificationSuccessful(address indexed verifier, bytes32 indexed publicHash)\`\n\n`;

markdown += `### 3. Shamir Secret Sharing & Escrow (Backend)\n`;
markdown += `- **Input:** Split ECIES-encrypted shares from Patient Client.\n`;
markdown += `- **Output:** 201 Created. Stores shares blindly in \`escrow.json\` or memory.\n`;
markdown += `- **Telemetry:** \`[SSS Escrow] Stored share X for Patient Y.\`\n\n`;

markdown += `### 4. Emergency Break-Glass Decryption & Sentinel\n`;
markdown += `- **Input:** 3 Custodian approvals (signatures) -> Decryption locally in Enclave.\n`;
markdown += `- **Output:** Plaintext EMR (returned ONLY to authorized Doctor Enclave memory).\n`;
markdown += `- **Events:** \`EmergencyAuditAnchored(sessionNonce, commitmentHash, timestamp)\` via AuditRelayer.\n`;
markdown += `- **Telemetry (Sentinel):** \`[AuditSentinel] ✅ Successfully reconciled decryption\` OR \`[AuditSentinel] 🚨 CRITICAL COMPLIANCE ALERT 🚨\` if no on-chain anchor is found.\n\n`;

markdown += `## SECTION 6: End-to-End Execution Trace\n\n`;

markdown += `### A. Issuance Phase\n`;
markdown += `1. **Frontend:** User inputs medical details + PIN.\n`;
markdown += `2. **Frontend Worker:** Hashes \`hash(patientId + diagnosis + date + secretSalt)\` using Poseidon. Generates Groth16 proof locally.\n`;
markdown += `3. **Frontend -> Backend:** Submits \`proof\`, \`public_hash\`, and \`encrypted_payload\` (AES-GCM encrypted via PIN).\n`;
markdown += `4. **Backend -> Blockchain:** Relays \`proof\` and \`public_hash\` to \`Verifier.sol\`. If valid, stores \`encrypted_payload\`.\n\n`;

markdown += `### B. Escrow Phase\n`;
markdown += `1. **Frontend:** Patient splits their master Curve25519 private key using 3-of-5 SSS.\n`;
markdown += `2. **Frontend:** Encrypts each share with a respective Custodian's Public Key (ECIES).\n`;
markdown += `3. **Frontend -> Backend:** Transmits blindly encrypted shares.\n`;
markdown += `4. **Backend:** Stores shares. Zero backend plaintext exposure.\n\n`;

markdown += `### C. Break-Glass & Audit Phase\n`;
markdown += `1. **ER Doctor:** Requests emergency access. Generates \`sessionNonce\`.\n`;
markdown += `2. **Custodians (x3):** Approve access, returning decrypted shares directly to the ER Doctor's Secure Enclave over TLS.\n`;
markdown += `3. **Enclave:** Reconstructs master private key. Decrypts patient's EMR. Generates ECDSA signature on \`keccak256(sessionNonce + commitmentHash)\`.\n`;
markdown += `4. **AuditAttestationService:** Bundles Doctor, Custodian, and Enclave signatures. Encrypts PII/PHI targeting Auditor.\n`;
markdown += `5. **AuditRelayer:** Asynchronously submits the blind commitment bundle to \`EmergencyAuditRegistry.sol\`.\n`;
markdown += `6. **AuditSentinel:** Cross-references Enclave decryption receipts against on-chain \`EmergencyAuditAnchored\` events. Fires alert if disconnected.\n\n`;

fs.appendFileSync(outputFile, markdown);
console.log('Sections 5 and 6 appended successfully.');
