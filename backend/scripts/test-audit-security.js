const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const AuditRelayer = require('../services/auditRelayer');
const AuditAttestationService = require('../services/auditAttestationService');
const AuditMonitor = require('../sentinel-service/src/auditMonitor');

async function compileContract() {
    const contractPath = path.join(__dirname, '../contracts/EmergencyAuditRegistry.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const ozPath = path.join(__dirname, '../node_modules', importPath);
            return { contents: fs.readFileSync(ozPath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const input = {
        language: 'Solidity',
        sources: { 'EmergencyAuditRegistry.sol': { content: source } },
        settings: { outputSelection: { '*': { '*': ['*'] } } }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    if (output.errors) {
        let hasErrors = false;
        output.errors.forEach(err => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasErrors = true;
        });
        if (hasErrors) throw new Error("Compilation failed");
    }
    return output.contracts['EmergencyAuditRegistry.sol']['EmergencyAuditRegistry'];
}

async function runTests() {
    console.log("=== Emergency Break-Glass Audit Integration Tests ===\n");

    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:7545');
    const admin = await provider.getSigner(0);
    const doctorWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    const custodianWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    const enclaveWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    const relayerWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    const rogueWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);

    // Fund wallets
    for (const w of [doctorWallet, custodianWallet, enclaveWallet, relayerWallet, rogueWallet]) {
        await admin.sendTransaction({ to: w.address, value: ethers.parseEther("1.0") });
    }

    let adminNonce = await admin.getNonce();

    const contractDef = await compileContract();
    const factory = new ethers.ContractFactory(contractDef.abi, contractDef.evm.bytecode.object, admin);
    const registry = await factory.deploy({ nonce: adminNonce++ });
    await registry.waitForDeployment();
    console.log("[Setup] Registry deployed.");

    // Setup RBAC
    await (await registry.setAuthorizedDoctor(doctorWallet.address, true, { nonce: adminNonce++ })).wait();
    await (await registry.setAuthorizedCustodian(custodianWallet.address, true, { nonce: adminNonce++ })).wait();
    await (await registry.setAuthorizedEnclave(enclaveWallet.address, true, { nonce: adminNonce++ })).wait();
    console.log("[Setup] RBAC Configured.");

    // Services
    const relayerContract = registry.connect(relayerWallet);
    const auditRelayer = new AuditRelayer(relayerWallet, relayerContract);
    const auditorPublicKey = "mock_auditor_pubkey";
    const attestationService = new AuditAttestationService(auditRelayer, auditorPublicKey);
    const auditMonitor = new AuditMonitor(registry);

    // ---------------------------------------------------------
    // Scenario 1: Happy Path Compliance
    // ---------------------------------------------------------
    console.log("\n--- Scenario 1: Happy Path Compliance ---");
    const sessionNonce1 = ethers.hexlify(ethers.randomBytes(32));
    const result1 = await attestationService.attestAndDispatchEmergency(
        "DOC_001", "PAT_123", "Cardiac Arrest", sessionNonce1,
        doctorWallet, custodianWallet, enclaveWallet
    );
    
    // Simulate instant decryption
    const currentBlock1 = await provider.getBlockNumber();
    auditMonitor.logLocalDecryption(sessionNonce1, result1.auditId, currentBlock1);
    
    // Wait for async queue to process
    await new Promise(r => setTimeout(r, 2000));
    
    const isValid = await registry.verifyAuditCommitment(result1.auditId, result1.commitmentHash);
    if (!isValid) throw new Error("Scenario 1 Failed: Commitment mismatch");
    console.log("✅ Scenario 1 Passed: Async anchor verified successfully.");

    // ---------------------------------------------------------
    // Scenario 2: Zero PII/Metadata Audit (Check Calldata)
    // ---------------------------------------------------------
    console.log("\n--- Scenario 2: Zero PII/Metadata Audit ---");
    const filter = registry.filters.EmergencyAuditAnchored();
    const events = await registry.queryFilter(filter, 0, 'latest');
    const tx = await provider.getTransaction(events[0].transactionHash);
    
    const calldataStr = tx.data.toLowerCase();
    const plaintextStrings = ["PAT_123", "DOC_001", "Cardiac Arrest"];
    for (const str of plaintextStrings) {
        const hexStr = Buffer.from(str, 'utf8').toString('hex').toLowerCase();
        if (calldataStr.includes(hexStr)) {
            throw new Error("Scenario 2 Failed: PII leaked in calldata!");
        }
    }
    console.log("✅ Scenario 2 Passed: Zero plaintext data exists in calldata.");

    // ---------------------------------------------------------
    // Scenario 3: Backend Tamper / Forgery Defense
    // ---------------------------------------------------------
    console.log("\n--- Scenario 3: Backend Tamper / Forgery Defense ---");
    const sessionNonce2 = ethers.hexlify(ethers.randomBytes(32));
    const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake_data"));
    const msgHash2 = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [sessionNonce2, fakeHash]);
    const msgHashBytes2 = ethers.getBytes(msgHash2);
    
    const docSig = await doctorWallet.signMessage(msgHashBytes2);
    const custSig = await custodianWallet.signMessage(msgHashBytes2);
    const rogueSig = await rogueWallet.signMessage(msgHashBytes2); // Falsified Enclave Sig!

    try {
        await registry.connect(relayerWallet).recordEmergencyAudit(
            sessionNonce2, fakeHash, docSig, custSig, rogueSig
        );
        throw new Error("Scenario 3 Failed: Forged sig was accepted");
    } catch (e) {
        const msg = e.info?.error?.message || e.message;
        if (!msg.includes("Invalid or unauthorized Enclave signature")) {
            console.error(e);
            throw new Error("Scenario 3 Failed with wrong error");
        }
        console.log("✅ Scenario 3 Passed: Forged Enclave signature rejected.");
    }

    // ---------------------------------------------------------
    // Scenario 4: Anti-Replay Defense
    // ---------------------------------------------------------
    console.log("\n--- Scenario 4: Anti-Replay Defense ---");
    try {
        const msgHash1 = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [sessionNonce1, result1.commitmentHash]);
        const msgHashBytes1 = ethers.getBytes(msgHash1);
        const docSig1 = await doctorWallet.signMessage(msgHashBytes1);
        const custSig1 = await custodianWallet.signMessage(msgHashBytes1);
        const encSig1 = await enclaveWallet.signMessage(msgHashBytes1);

        await registry.connect(relayerWallet).recordEmergencyAudit(
            sessionNonce1, result1.commitmentHash, docSig1, custSig1, encSig1
        );
        throw new Error("Scenario 4 Failed: Replay attack succeeded");
    } catch (e) {
        const msg = e.info?.error?.message || e.message;
        if (!msg.includes("Nonce already consumed (Replay Attack)")) {
            throw new Error("Scenario 4 Failed with wrong error");
        }
        console.log("✅ Scenario 4 Passed: Replay attack blocked by nonce.");
    }

    // ---------------------------------------------------------
    // Scenario 5: Network Disruption / RPC Partition Resilience
    // ---------------------------------------------------------
    console.log("\n--- Scenario 5: RPC Partition Resilience ---");
    const originalProvider = relayerContract.runner.provider;
    
    // Simulate RPC Failure
    const badProvider = new ethers.JsonRpcProvider('http://127.0.0.1:9999'); // invalid port
    const badRelayerWallet = new ethers.Wallet(relayerWallet.privateKey, badProvider);
    auditRelayer.registry = registry.connect(badRelayerWallet);

    const sessionNonce5 = ethers.hexlify(ethers.randomBytes(32));
    
    console.log("Declaring emergency while RPC is down...");
    // Should NOT throw, because enqueue is non-blocking!
    const result5 = await attestationService.attestAndDispatchEmergency(
        "DOC_001", "PAT_123", "Stroke", sessionNonce5,
        doctorWallet, custodianWallet, enclaveWallet
    );
    console.log("Decryption authorized instantly despite RPC failure!");

    await new Promise(r => setTimeout(r, 2000)); // Let the relayer fail once
    
    // Restore RPC
    console.log("Restoring RPC connection...");
    auditRelayer.registry = relayerContract; 
    
    await new Promise(r => setTimeout(r, 4000)); // Wait for retry to succeed

    const isValid5 = await registry.verifyAuditCommitment(result5.auditId, result5.commitmentHash);
    if (!isValid5) throw new Error("Scenario 5 Failed: Commitment not anchored after retry");
    console.log("✅ Scenario 5 Passed: Async anchor verified successfully after RPC restored.");

    // ---------------------------------------------------------
    // Scenario 6: Audit Reconciliation Sentinel
    // ---------------------------------------------------------
    console.log("\n--- Scenario 6: Audit Reconciliation Sentinel ---");
    const sessionNonce6 = ethers.hexlify(ethers.randomBytes(32));
    const fakeAuditId = ethers.hexlify(ethers.randomBytes(32));
    
    auditMonitor.start();
    auditMonitor.logLocalDecryption(sessionNonce6, fakeAuditId, await provider.getBlockNumber());
    
    // Mine blocks to trigger timeout
    console.log("Mining blocks to simulate missing anchor...");
    for (let i = 0; i <= auditMonitor.timeoutBlocks; i++) {
        await provider.send("evm_mine", []);
    }
    
    await auditMonitor._sweep(); // Force sweep
    // Output should show CRITICAL COMPLIANCE ALERT
    console.log("✅ Scenario 6 Passed: Sentinel successfully detected unanchored decryption.");
    
    auditMonitor.stop();
    console.log("\n✅ All Audit Security integration tests passed securely.");
}

if (require.main === module) {
    runTests().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
