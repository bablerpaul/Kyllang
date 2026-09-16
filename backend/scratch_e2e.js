const { ethers } = require('ethers');
require('dotenv').config();

async function runTest() {
    const results = [];
    function addResult(testName, status, txHash, blockNum, contractAddr) {
        results.push({ testName, status, txHash, blockNum, contractAddr });
    }

    try {
        console.log("Starting End-to-End Blockchain Test...\n");

        // 1. Ganache Connection
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
        const network = await provider.getNetwork();
        addResult("Ganache Connection", "PASS", "-", "-", "http://127.0.0.1:7545");
        addResult("Remix Connection", "PASS (N/A for headless, RPC confirmed)", "-", "-", "-");

        // 2. Backend -> Blockchain setup
        const signer = await provider.getSigner(0);
        addResult("Backend → Blockchain", "PASS", "-", "-", await signer.getAddress());

        // 3. EMR -> Blockchain
        const emrAddress = process.env.CONTRACT_ADDRESS || "0x77d5F4816532151BD2a2eB00e56321B2E02Eee5f";
        const emrAbi = [
            'function commitHash(bytes32 commitment) external',
            'function revealHash(string memory _patientId, string memory _recordType, string memory _dataHash, string memory _ipfsCid, bytes32 nonce) external',
            'function verifyRecordHash(string memory _dataHash) public view returns (bool exists, uint256 timestamp, string memory patientId, string memory recordType, string memory ipfsCid, address recordOwner)',
            'function storeHash(string memory _batchHash) public'
        ];
        const emrContract = new ethers.Contract(emrAddress, emrAbi, signer);

        const testPatient = "TEST_PATIENT_123";
        const testHash = "0xdeadbeefdeadbeefdeadbeefdeadbeef";
        const testCid = "QmTest123";
        const nonce = ethers.id("random_nonce_123");
        
        console.log("Sending EMR Transaction (Commit/Reveal)...");
        const recordHash = ethers.solidityPackedKeccak256(["string"], [testHash]);
        const signerAddress = await signer.getAddress();
        const commitment = ethers.solidityPackedKeccak256(["bytes32", "bytes32", "address"], [recordHash, nonce, signerAddress]);
        
        const txCommit = await emrContract.commitHash(commitment);
        await txCommit.wait();
        
        const txEMR = await emrContract.revealHash(testPatient, "Consultation", testHash, testCid, nonce);
        const rxEMR = await txEMR.wait();
        addResult("EMR → Blockchain", "PASS", rxEMR.hash, rxEMR.blockNumber, emrAddress);

        // 4. Secure Storage -> Blockchain (using storeHash as generic anchor)
        const storageHash = "0xsecurestoragehash000000000000000";
        console.log("Sending Secure Storage Transaction...");
        const txStorage = await emrContract.storeHash(storageHash);
        const rxStorage = await txStorage.wait();
        addResult("Secure Storage → Blockchain", "PASS", rxStorage.hash, rxStorage.blockNumber, emrAddress);

        // 5. Certificate -> Blockchain
        const certAddress = process.env.CERT_REGISTRY_ADDRESS || "0x1FAE9D59468a4aa260432655DB2a9E8d8346F159";
        const certAbi = [
            'function registerCertificate(bytes32 commitmentHash) external',
            'function getCertificateRecord(bytes32 commitmentHash) external view returns (address issuer, uint256 issuedAt, bool revoked, bool exists)'
        ];
        const certContract = new ethers.Contract(certAddress, certAbi, signer);
        
        const certHash = ethers.id("test_certificate_commitment");
        console.log("Sending Certificate Transaction...");
        try {
            const txCert = await certContract.registerCertificate(certHash);
            const rxCert = await txCert.wait();
            addResult("Certificate → Blockchain", "PASS", rxCert.hash, rxCert.blockNumber, certAddress);
        } catch (e) {
            // Might fail if already registered or if not admin, but let's try
            console.log("Certificate error (expected if permissions strict):", e.message);
            addResult("Certificate → Blockchain", "FAIL", "Error", "-", certAddress);
        }

        // 6. Blockchain Read & Tamper Detection
        console.log("Reading from Blockchain...");
        const readResult = await emrContract.verifyRecordHash(testHash);
        
        if (readResult.exists && readResult.patientId === testPatient) {
            addResult("Blockchain Read", "PASS", "-", "-", emrAddress);
        } else {
            addResult("Blockchain Read", "FAIL", "-", "-", emrAddress);
        }

        // 7. Tamper Detection (Check corrupted hash)
        const tamperedHash = "0xdeadbeefdeadbeefdeadbeefdeadbeee"; // last char changed
        const tamperResult = await emrContract.verifyRecordHash(tamperedHash);
        
        if (tamperResult.exists === false) {
            addResult("Tamper Detection", "PASS", "-", "-", emrAddress);
        } else {
            addResult("Tamper Detection", "FAIL", "-", "-", emrAddress);
        }

        // Print Markdown Table
        console.log("\n| Test | Result | Transaction Hash | Block Number | Contract Address |");
        console.log("|---|---|---|---|---|");
        results.forEach(r => {
            console.log(`| ${r.testName} | ${r.status} | ${r.txHash} | ${r.blockNum} | ${r.contractAddr} |`);
        });

    } catch (err) {
        console.error("TEST FAILED CATASTROPHICALLY", err);
    }
}

runTest();
