require('dotenv').config();
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Dynamically import ES module function from client using dynamic import
async function loadClient() {
    const keyEscrowClientPath = 'file://' + path.resolve(__dirname, '../../certificate-portal/src/crypto/keyEscrowClient.js').replace(/\\/g, '/');
    return await import(keyEscrowClientPath);
}

const { reconstructKey } = require('../services/escrowRecoveryService');

async function main() {
    console.log("=== Starting SSS Key Escrow Security Tests ===");

    const client = await loadClient();

    // 1. Generate 5 Custodian Keys
    console.log("\n[1] Generating 5 Custodian Keypairs...");
    const custodianKeys = [];
    for (let i = 0; i < 5; i++) {
        custodianKeys.push(nacl.box.keyPair());
    }
    const custodianPubKeys = custodianKeys.map(k => k.publicKey);

    // 2. Patient Client: Generate Escrow Package
    console.log("\n[2] Patient generating Escrow Package...");
    const { patientKeyPair, escrowPackage } = await client.generateEscrowPackage(custodianPubKeys);
    console.log("Patient Public Key:", escrowPackage.patientPubKey);
    console.log(`Generated ${escrowPackage.envelopes.length} encrypted envelopes.`);

    // 3. Backend Simulation (Store off-chain envelopes)
    console.log("\n[3] Backend storing off-chain envelopes...");
    const offChainEnvelopes = escrowPackage.envelopes.filter(e => e.custodianId !== 2);
    
    // 4. Ganache Simulation (Store on-chain envelope)
    console.log("\n[4] Backend submitting on-chain envelope to Ganache...");
    const onChainEnvelope = escrowPackage.envelopes.find(e => e.custodianId === 2);
    
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const adminKey = process.env.PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    const adminWallet = new ethers.Wallet(adminKey, provider);
    
    const registryAddress = process.env.KEY_ESCROW_REGISTRY_ADDRESS;
    if (!registryAddress) throw new Error("KEY_ESCROW_REGISTRY_ADDRESS not set in .env");

    const abi = [
        "function depositEscrow(bytes32 patientPubKey, bytes calldata encryptedShare, tuple(uint256 x, uint256 y) c0, tuple(uint256 x, uint256 y) c1, tuple(uint256 x, uint256 y) c2, address trustee) external",
        "function getEncryptedShare(bytes32 patientPubKey) external view returns (bytes memory)",
        "function getFeldmanCommitments(bytes32 patientPubKey) external view returns (tuple(uint256 x, uint256 y) c0, tuple(uint256 x, uint256 y) c1, tuple(uint256 x, uint256 y) c2)",
        "function approveEmergencyUnlock(bytes32 patientPubKey) external",
        "function escrowRecords(bytes32) external view returns (bytes, tuple(uint256 x, uint256 y), tuple(uint256 x, uint256 y), tuple(uint256 x, uint256 y), address, bool, bool)"
    ];
    const registry = new ethers.Contract(registryAddress, abi, adminWallet);

    const pubKeyBuffer = Buffer.from(escrowPackage.patientPubKey, 'base64');
    const patientPubKeyHex = '0x' + pubKeyBuffer.toString('hex');
    const ciphertextHex = '0x' + Buffer.from(JSON.stringify(onChainEnvelope)).toString('hex');

    const c0 = { x: escrowPackage.commitments[0].x, y: escrowPackage.commitments[0].y };
    const c1 = { x: escrowPackage.commitments[1].x, y: escrowPackage.commitments[1].y };
    const c2 = { x: escrowPackage.commitments[2].x, y: escrowPackage.commitments[2].y };

    // Check if exists first to avoid revert
    const record = await registry.escrowRecords(patientPubKeyHex);
    if (!record[6]) { // exists
        console.log("Depositing escrow...");
        const tx = await registry.depositEscrow(patientPubKeyHex, ciphertextHex, c0, c1, c2, adminWallet.address);
        await tx.wait();
        console.log("Escrow deposited successfully.");
    } else {
        console.log("Escrow already exists for this public key.");
    }

    // 5. Recovery Scenario 1: Normal 3-of-5
    console.log("\n[5] Scenario 1: Normal 3-of-5 Recovery (Using custodians 1, 3, and 4)");
    try {
        const recoveryEnvelopes = [
            offChainEnvelopes.find(e => e.custodianId === 1),
            offChainEnvelopes.find(e => e.custodianId === 3),
            offChainEnvelopes.find(e => e.custodianId === 4),
        ];

        // Simulate fetching commitments
        const fetchedCommitments = escrowPackage.commitments;

        // Custodians 1, 3, 4 private keys
        const recoveryKeys = {
            1: custodianKeys[0].secretKey,
            3: custodianKeys[2].secretKey,
            4: custodianKeys[3].secretKey
        };

        const { patientKeyPair: recoveredKeyPair } = await reconstructKey(recoveryEnvelopes, recoveryKeys, fetchedCommitments);
        
        const originalPub = naclUtil.encodeBase64(patientKeyPair.publicKey);
        const recoveredPub = naclUtil.encodeBase64(recoveredKeyPair.publicKey);

        if (originalPub === recoveredPub) {
            console.log("✅ SUCCESS: Key successfully recovered and matches original.");
        } else {
            console.error("❌ FAILED: Recovered key does not match original.");
        }
    } catch (e) {
        console.error("❌ FAILED: Unexpected error in normal recovery:", e);
    }

    // 6. Recovery Scenario 2: Threshold Check (2-of-5)
    console.log("\n[6] Scenario 2: Threshold Check (Trying to recover with only 2 shares)");
    try {
        const recoveryEnvelopes = [
            offChainEnvelopes.find(e => e.custodianId === 1),
            offChainEnvelopes.find(e => e.custodianId === 3)
        ];

        const recoveryKeys = {
            1: custodianKeys[0].secretKey,
            3: custodianKeys[2].secretKey
        };

        await reconstructKey(recoveryEnvelopes, recoveryKeys, escrowPackage.commitments);
        console.error("❌ FAILED: Reconstructed with < 3 shares!");
    } catch (e) {
        if (e.message.includes('Need at least 3 envelopes')) {
            console.log("✅ SUCCESS: Properly rejected recovery with < 3 shares.");
        } else {
            console.error("❌ FAILED with wrong error:", e);
        }
    }

    // 7. Recovery Scenario 3: Tampered Share (Feldman VSS)
    console.log("\n[7] Scenario 3: Malicious Custodian / Tampered Share");
    try {
        const recoveryEnvelopes = [
            offChainEnvelopes.find(e => e.custodianId === 1),
            offChainEnvelopes.find(e => e.custodianId === 3),
            offChainEnvelopes.find(e => e.custodianId === 4)
        ];

        const recoveryKeys = {
            1: custodianKeys[0].secretKey,
            3: custodianKeys[2].secretKey,
            4: custodianKeys[3].secretKey
        };

        // Let's modify the ciphertext of custodian 3's envelope.
        // It's authenticated encryption (nacl.box), so modifying ciphertext will cause decryption failure.
        // To bypass nacl.box validation and test Feldman VSS directly, we would need to let it decrypt
        // successfully but return a corrupted y value.
        // Let's create a custom corrupted envelope just for custodian 3.
        const corruptedShare = { x: 3, y: "1234abcd5678" }; // completely wrong y
        const corruptedShareBytes = naclUtil.decodeUTF8(JSON.stringify(corruptedShare));
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const ephemeralKeyPair = nacl.box.keyPair();
        
        const corruptedEncryptedBox = nacl.box(
            corruptedShareBytes,
            nonce,
            custodianPubKeys[2], // custodian 3
            ephemeralKeyPair.secretKey
        );

        recoveryEnvelopes[1] = {
            custodianId: 3,
            ephemeralPubKey: naclUtil.encodeBase64(ephemeralKeyPair.publicKey),
            nonce: naclUtil.encodeBase64(nonce),
            ciphertext: naclUtil.encodeBase64(corruptedEncryptedBox)
        };

        await reconstructKey(recoveryEnvelopes, recoveryKeys, escrowPackage.commitments);
        console.error("❌ FAILED: Reconstructed despite tampered share!");
    } catch (e) {
        if (e.message.includes('Feldman VSS validation failed')) {
            console.log("✅ SUCCESS: Feldman VSS caught the tampered share!");
        } else {
            console.error("❌ FAILED: Threw wrong error:", e);
        }
    }

    console.log("\n=== All Tests Completed ===");
}

main().catch(console.error);
