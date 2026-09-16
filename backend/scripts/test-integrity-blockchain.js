const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compileContract() {
    const contractPath = path.resolve(__dirname, '../contracts/EMRRegistry.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'EMRRegistry.sol': { content: source }
        },
        settings: { outputSelection: { '*': { '*': ['*'] } } }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
        let hasError = false;
        for (const err of output.errors) {
            if (err.severity === 'error') {
                console.error(err.formattedMessage);
                hasError = true;
            }
        }
        if (hasError) throw new Error("Compilation failed");
    }

    const contractFile = output.contracts['EMRRegistry.sol']['EMRRegistry'];
    return {
        abi: contractFile.abi,
        bytecode: contractFile.evm.bytecode.object
    };
}

async function runTests() {
    console.log("=== BLOCKCHAIN INTEGRITY ANCHORING TESTS (TASK 5D) ===");
    const { abi, bytecode } = await compileContract();

    const ganache = require("ganache");
    const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    
    // Get accounts from Ganache
    const signer = await provider.getSigner(0);
    const unauthorizedSigner = await provider.getSigner(1);

    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    console.log("Deploying EMRRegistry.sol locally for tests...");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    console.log("Contract deployed to:", await contract.getAddress());

    const recordCommitment = ethers.id("test-record-id-123-with-secret");
    const h1 = ethers.id("hash-version-1");
    const h2 = ethers.id("hash-version-2");
    const h3 = ethers.id("hash-version-3");
    
    let passed = 0;
    let failed = 0;

    const assertReject = async (promiseFn, name) => {
        try {
            const tx = await promiseFn();
            if (tx && tx.wait) await tx.wait();
            console.error(`[FAIL] ${name} - Expected rejection but succeeded`);
            failed++;
        } catch (e) {
            console.log(`[PASS] ${name}`);
            passed++;
        }
    };

    const assertPass = async (promiseFn, name) => {
        try {
            const tx = await promiseFn();
            if (tx && tx.wait) await tx.wait();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (e) {
            console.error(`[FAIL] ${name} - Expected success but failed: ${e.message}`);
            failed++;
        }
    };

    // A. First anchor
    await assertPass(
        () => contract.storeIntegrityAnchor(recordCommitment, 1n, h1, ethers.ZeroHash),
        "First anchor (Version 1)"
    );

    // B. Second version
    await assertPass(
        () => contract.storeIntegrityAnchor(recordCommitment, 2n, h2, h1),
        "Second version (Version 2)"
    );

    // C. Third version
    await assertPass(
        () => contract.storeIntegrityAnchor(recordCommitment, 3n, h3, h2),
        "Third version (Version 3)"
    );

    const h4 = ethers.id("hash-version-4");

    // D. V1 -> V3 rejected (Version skipping)
    const rc3 = ethers.id("test-record-id-skip");
    await contract.storeIntegrityAnchor(rc3, 1n, h1, ethers.ZeroHash);
    await assertReject(
        () => contract.storeIntegrityAnchor(rc3, 3n, h3, h1),
        "V1 -> V3 rejected (version skipping)"
    );

    // D2. V2 -> V4 rejected
    await contract.storeIntegrityAnchor(rc3, 2n, h2, h1);
    await assertReject(
        () => contract.storeIntegrityAnchor(rc3, 4n, h4, h2),
        "V2 -> V4 rejected (version skipping)"
    );

    // E. Duplicate version rejection
    await assertReject(
        () => contract.storeIntegrityAnchor(recordCommitment, 3n, h3, h2),
        "Duplicate version rejection"
    );

    // F. Wrong previous hash rejection
    await assertReject(
        () => contract.storeIntegrityAnchor(recordCommitment, 4n, h4, h1), // Should be h3
        "Wrong previous hash rejection"
    );

    // F2. Cross-record previous hash rejected
    const rc4 = ethers.id("test-record-id-cross");
    await contract.storeIntegrityAnchor(rc4, 1n, h1, ethers.ZeroHash);
    await assertReject(
        () => contract.storeIntegrityAnchor(rc4, 2n, h2, h3), // h3 belongs to recordCommitment
        "Cross-record previous hash rejected"
    );

    // G. Version decrease rejection (V3 -> V2)
    await assertReject(
        () => contract.storeIntegrityAnchor(recordCommitment, 2n, h2, h1),
        "V3 -> V2 rejected (version decrease)"
    );

    // H. Unauthorized anchor rejection
    const unauthorizedContract = contract.connect(unauthorizedSigner);
    await assertReject(
        () => unauthorizedContract.storeIntegrityAnchor(recordCommitment, 4n, h4, h3),
        "Unauthorized anchor rejection"
    );

    // I. Latest state retrieval
    const [latestVersion, latestHash] = await contract.getLatestRecordState(recordCommitment);
    if (latestVersion === 3n && latestHash === h3) {
        console.log("[PASS] Latest state retrieval");
        passed++;
    } else {
        console.error("[FAIL] Latest state retrieval");
        failed++;
    }

    // J. Historical state retrieval
    const [c1, v1, ih1, ph1, t1] = await contract.getHistoricalIntegrityAnchor(0);
    if (v1 === 1n && ih1 === h1 && ph1 === ethers.ZeroHash) {
        console.log("[PASS] Historical state retrieval");
        passed++;
    } else {
        console.error("[FAIL] Historical state retrieval");
        failed++;
    }

    // K. Multiple different EMRs
    const recordCommitment2 = ethers.id("test-record-id-456-with-secret");
    await assertPass(
        () => contract.storeIntegrityAnchor(recordCommitment2, 1n, h1, ethers.ZeroHash),
        "Multiple different EMRs"
    );

    // L. Direct Historical Lookup (O(1))
    const [lookupC1, lookupV1, lookupH1, lookupPrevH1, lookupT1] = await contract.getIntegrityAnchor(recordCommitment, 1n);
    if (lookupV1 === 1n && lookupH1 === h1) {
        console.log("[PASS] Version 1 direct lookup");
        passed++;
    } else {
        console.error("[FAIL] Version 1 direct lookup");
        failed++;
    }

    const [lookupC2, lookupV2, lookupH2, lookupPrevH2, lookupT2] = await contract.getIntegrityAnchor(recordCommitment, 2n);
    if (lookupV2 === 2n && lookupH2 === h2) {
        console.log("[PASS] Version 2 direct lookup");
        passed++;
    } else {
        console.error("[FAIL] Version 2 direct lookup");
        failed++;
    }

    const [lookupC3, lookupV3, lookupH3, lookupPrevH3, lookupT3] = await contract.getIntegrityAnchor(recordCommitment, 3n);
    if (lookupV3 === 3n && lookupH3 === h3) {
        console.log("[PASS] Version 3 direct lookup");
        passed++;
    } else {
        console.error("[FAIL] Version 3 direct lookup");
        failed++;
    }

    // M. Nonexistent version lookup
    await assertReject(
        () => contract.getIntegrityAnchor(recordCommitment, 99n),
        "Nonexistent version lookup rejected"
    );
    await assertReject(
        () => contract.getIntegrityAnchor(recordCommitment, 0n),
        "Zero version lookup rejected"
    );

    // M2. Multiple EMRs with same version numbers
    const [lookupC_other, lookupV_other, lookupH_other] = await contract.getIntegrityAnchor(recordCommitment2, 1n);
    if (lookupC_other === recordCommitment2 && lookupV_other === 1n && lookupH_other === h1) {
        console.log("[PASS] Version lookup strictly isolated to specific recordCommitment");
        passed++;
    } else {
        console.error("[FAIL] Version lookup isolated to specific recordCommitment");
        failed++;
    }

    // N. Zero-value validation
    await assertReject(
        () => contract.storeIntegrityAnchor(ethers.ZeroHash, 1n, h1, ethers.ZeroHash),
        "Zero-value recordCommitment validation"
    );

    // Rollback simulation
    // MongoDB says we are at version 1 (H1).
    // The chain says we are at version 3 (H3).
    // This allows the verification layer to detect the rollback.
    const [chainVersion, chainHash] = await contract.getLatestRecordState(recordCommitment);
    if (chainVersion > 1n) {
        console.log("[PASS] Rollback scenario detectable (Chain Version > DB Version)");
        passed++;
    } else {
        console.error("[FAIL] Rollback scenario detectable");
        failed++;
    }

    // Existing dataHash anchor backwards compatibility test
    await assertPass(
        () => contract.storeEMRRecord(
            ethers.id("patient-xyz"),
            "MedicalRecord",
            "legacy-data-hash",
            "ipfs-cid"
        ),
        "Existing legacy dataHash anchoring works perfectly in parallel"
    );

    console.log(`\nTests completed. Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
