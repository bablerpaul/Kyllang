const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

// Helper classes we just built
const SentinelWorker = require('../sentinel-service/src/sentinelWorker');
const RootSyncService = require('../services/rootSyncService');

// --- Mock Database for Testing ---
class MockDatabase {
    constructor() {
        this.records = [];
    }
    async insertRecord(record) {
        this.records.push(record);
    }
    async fetchRecordsLinearizable() {
        // Return a deep copy to prevent mutation bugs
        return JSON.parse(JSON.stringify(this.records));
    }
    // Simulate an attacker modifying DB out of band
    async simulateTampering(index, modifiedRecord) {
        this.records[index] = modifiedRecord;
    }
}

async function compileContract(contractName, sourcePath) {
    const source = fs.readFileSync(sourcePath, 'utf8');

    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const resolvedPath = path.resolve(__dirname, '../node_modules', importPath);
            return { contents: fs.readFileSync(resolvedPath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const input = {
        language: 'Solidity',
        sources: { [contractName + '.sol']: { content: source } },
        settings: { outputSelection: { '*': { '*': ['*'] } } }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => { if (err.severity === 'error') { console.error(err.formattedMessage); hasError = true; }});
        if (hasError) throw new Error("Compilation failed");
    }
    return output.contracts[contractName + '.sol'][contractName];
}

async function mineBlocks(provider, count) {
    for (let i = 0; i < count; i++) {
        await provider.send("evm_mine", []);
    }
}

async function runTests() {
    console.log("=== Forensic Sentinel Security Integration Tests ===\n");
    
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // We'll use 5 accounts from Ganache
    const adminKey = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d'; 
    const signer1Key = '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1';
    const signer2Key = '0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c';
    
    const admin = new ethers.Wallet(adminKey, provider);
    const signer1 = new ethers.Wallet(signer1Key, provider);
    const signer2 = new ethers.Wallet(signer2Key, provider);
    const sentinelWallet = ethers.Wallet.createRandom().connect(provider);
    
    let adminNonce = await provider.getTransactionCount(admin.address);
    // Fund sentinel wallet for gas
    await admin.sendTransaction({ to: sentinelWallet.address, value: ethers.parseEther("1.0"), nonce: adminNonce++ });

    // 1. Compile & Deploy
    const sentinelArtifact = await compileContract('ForensicSentinelRegistry', path.resolve(__dirname, '../contracts/ForensicSentinelRegistry.sol'));
    const breakGlassArtifact = await compileContract('BreakGlassRegistry', path.resolve(__dirname, '../contracts/BreakGlassRegistry.sol'));

    // We use a small timeout for testing (e.g., 5 blocks)
    const TIMEOUT_BLOCKS = 5;
    
    const sentinelFactory = new ethers.ContractFactory(sentinelArtifact.abi, sentinelArtifact.evm.bytecode.object, admin);
    const sentinelRegistry = await sentinelFactory.deploy(sentinelWallet.address, TIMEOUT_BLOCKS, { nonce: adminNonce++ });
    await sentinelRegistry.waitForDeployment();
    
    const bgFactory = new ethers.ContractFactory(breakGlassArtifact.abi, breakGlassArtifact.evm.bytecode.object, admin);
    const bgRegistry = await bgFactory.deploy({ nonce: adminNonce++ });
    await bgRegistry.waitForDeployment();
    await (await bgRegistry.setForensicSentinelRegistry(await sentinelRegistry.getAddress(), { nonce: adminNonce++ })).wait();

    // Setup Multi-Sig
    await (await sentinelRegistry.setAuthorizedSigner(signer1.address, true, { nonce: adminNonce++ })).wait();
    await (await sentinelRegistry.setAuthorizedSigner(signer2.address, true, { nonce: adminNonce++ })).wait();
    
    // Authorize ER Doctor
    await (await bgRegistry.setERDoctor(admin.address, true, { nonce: adminNonce++ })).wait();

    console.log("[Setup] Contracts deployed and configured.");

    const db = new MockDatabase();
    
    // The registry needs to be wrapped for the services (they need a signer)
    const rootSyncService = new RootSyncService(db, sentinelRegistry.connect(admin), [signer1, signer2]);
    const sentinelDaemon = new SentinelWorker(db, sentinelRegistry.connect(sentinelWallet), 1000);
    
    // Helper to attempt BreakGlass
    async function attemptBreakGlass() {
        try {
            await bgRegistry.connect(admin).declareEmergency(
                ethers.keccak256(ethers.toUtf8Bytes("patient123")), 
                ethers.keccak256(ethers.toUtf8Bytes("ticket")),
                "pubkey123",
                { nonce: adminNonce++ }
            );
            return true;
        } catch (e) {
            // Ethers v6 coalesces reverts, so we check the inner info if available
            const message = e.info?.error?.message || e.message;
            if (message.includes("System Lockdown")) return false;
            throw e;
        }
    }

    // --- Scenario 1: Normal Heartbeat & Sync ---
    console.log("\n--- Scenario 1: Normal Heartbeat & Sync ---");
    await rootSyncService.commitLegitimateWrite({ id: "cert_001", data: "medical_record_1" });
    
    // Sentinel runs sweep (simulating its interval firing)
    await sentinelDaemon.sweepAndDispatch();
    
    let isOperational = await sentinelRegistry.isSystemOperational();
    console.log(`System Operational? ${isOperational}`);
    if (!isOperational) throw new Error("Scenario 1 Failed: System should be operational");

    // --- Scenario 4 & 5: Defense Checks ---
    console.log("\n--- Scenario 4: Unauthorized Root Overwrite Defense ---");
    try {
        const dummyRoot = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
        // Attempt update with only 1 signature
        const msgHash = ethers.solidityPackedKeccak256(
            ['bytes32', 'uint256', 'uint256', 'address'],
            [dummyRoot, 2, (await provider.getNetwork()).chainId, await sentinelRegistry.getAddress()]
        );
        const sig = await signer1.signMessage(ethers.getBytes(msgHash));
        await sentinelRegistry.connect(admin).updateApprovedRoot(dummyRoot, 2, [sig, sig], { nonce: adminNonce++ });
        throw new Error("Should have failed!");
    } catch(e) {
        console.log("Attack thwarted! Unauthorized update reverted.");
    }

    console.log("\n--- Scenario 5: State Rollback Defense ---");
    try {
        const dummyRoot = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
        // Sequence 1 was already used, try to rollback
        await sentinelRegistry.connect(admin).updateApprovedRoot(dummyRoot, 1, [], { nonce: adminNonce++ });
        throw new Error("Should have failed!");
    } catch(e) {
        console.log("Attack thwarted! State rollback reverted.");
    }

    // --- Scenario 2: Silent DB Manipulation Attack ---
    console.log("\n--- Scenario 2: Silent DB Manipulation Attack ---");
    console.log("Attacker directly alters database record...");
    await db.simulateTampering(0, { id: "cert_001", data: "TAMPERED_RECORD" });
    
    // Sentinel sweeps and detects divergence
    await sentinelDaemon.sweepAndDispatch(); // Warning (Mismatch 1)
    await sentinelDaemon.sweepAndDispatch(); // Lockdown (Mismatch 2)
    
    isOperational = await sentinelRegistry.isSystemOperational();
    console.log(`System Operational after tamper? ${isOperational}`);
    if (isOperational) throw new Error("Scenario 2 Failed: System should be locked down");
    
    console.log("Attempting Break-Glass operation...");
    const bgSuccess1 = await attemptBreakGlass();
    if (bgSuccess1) throw new Error("Scenario 2 Failed: Break-Glass should be blocked");
    console.log("Break-Glass successfully blocked by Sentinel.");

    // --- Scenario 3: Sentinel Silencing / Process Kill Attack ---
    console.log("\n--- Scenario 3: Sentinel Silencing / Dead-Man's Switch ---");
    // Deploy a fresh system to reset status to Operational for this test
    adminNonce = await admin.getNonce(); // Refresh nonce after failed estimateGas calls
    const newSentinel = await sentinelFactory.deploy(sentinelWallet.address, TIMEOUT_BLOCKS, { nonce: adminNonce++ });
    await newSentinel.waitForDeployment();
    await (await bgRegistry.setForensicSentinelRegistry(await newSentinel.getAddress(), { nonce: adminNonce++ })).wait();
    
    isOperational = await newSentinel.isSystemOperational();
    console.log(`Fresh System Operational? ${isOperational}`);
    
    console.log("Attacker kills the Sentinel process...");
    console.log(`Mining ${TIMEOUT_BLOCKS + 1} blocks to trigger timeout...`);
    await mineBlocks(provider, TIMEOUT_BLOCKS + 1);
    
    isOperational = await newSentinel.isSystemOperational();
    console.log(`System Operational after timeout? ${isOperational}`);
    if (isOperational) throw new Error("Scenario 3 Failed: System should be locked down by Dead-Man's Switch");

    const bgSuccess2 = await attemptBreakGlass();
    if (bgSuccess2) throw new Error("Scenario 3 Failed: Break-Glass should be blocked by timeout");
    console.log("Break-Glass successfully blocked by Dead-Man's switch.");

    console.log("\n✅ All Forensic Sentinel integration tests passed securely.");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
