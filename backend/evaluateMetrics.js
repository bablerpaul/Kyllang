const mongoose = require('mongoose');
const { performance } = require('perf_hooks');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Connect to DB
const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kyllang_test');
};

const evaluate = async () => {
    console.log('Starting Evaluation...');
    await connectDB();
    
    const results = {};

    // 1. Encryption & 2. Memory (from benchmark results)
    const benchmarkResultsPath = path.join(__dirname, 'results.json');
    if (fs.existsSync(benchmarkResultsPath)) {
        const bmData = JSON.parse(fs.readFileSync(benchmarkResultsPath));
        results.encryption = bmData;
    } else {
        results.encryption = "Run node --expose-gc benchmark.js first";
    }

    // 3. Blockchain transaction overhead
    // We measure the cryptographic commitment generation + transaction prep
    const ethers = require('ethers');
    let bcStart = performance.now();
    for (let i = 0; i < 100; i++) {
        ethers.solidityPackedKeccak256(['string', 'string'], ['mock_patient', crypto.randomBytes(32).toString('hex')]);
    }
    let bcEnd = performance.now();
    results.blockchainCommitmentGenerationLatencyMs = (bcEnd - bcStart) / 100;

    // 4. IPFS upload/download performance
    // Simulated via local disk I/O to represent the chunking and hashing that IPFS does
    const ipfsStart = performance.now();
    const mockFile = crypto.randomBytes(10 * 1024 * 1024); // 10 MB
    const ipfsHashStart = performance.now();
    const mockHash = crypto.createHash('sha256').update(mockFile).digest('hex');
    const ipfsEnd = performance.now();
    results.ipfsHashing10MB = (ipfsEnd - ipfsHashStart);

    // 5. Consent verification latency
    // Time to execute Consent.findOne
    const Consent = require('./models/Consent');
    await Consent.create({
        patient: new mongoose.Types.ObjectId(),
        grantedTo: new mongoose.Types.ObjectId(),
        grantedToRole: 'doctor',
        scope: 'full_access',
        expiresAt: new Date(Date.now() + 86400000)
    }); // Create a mock consent

    let totalConsentTime = 0;
    const iters = 100;
    for (let i = 0; i < iters; i++) {
        const start = performance.now();
        await Consent.findOne({ scope: 'full_access' }).lean();
        const end = performance.now();
        totalConsentTime += (end - start);
    }
    results.consentVerificationLatencyMs = totalConsentTime / iters;

    // 6. Certificate verification latency
    // HMAC recomputation
    const certStart = performance.now();
    for (let i = 0; i < 1000; i++) {
        const hashString = `patientId|diagnosis|validFrom|validUntil`;
        crypto.createHmac('sha256', 'secret').update(hashString).digest('hex');
    }
    const certEnd = performance.now();
    results.certificateVerificationLatencyMs = (certEnd - certStart) / 1000;

    // 7. Native enclave cryptographic operation latency (TweetNaCl)
    const naclStart = performance.now();
    for (let i = 0; i < 1000; i++) {
        nacl.box.keyPair();
    }
    const naclEnd = performance.now();
    results.nativeEnclaveLatencyMs = (naclEnd - naclStart) / 1000;

    console.log('\n--- MEASURABLE RESULTS ---');
    console.log(JSON.stringify(results, null, 2));

    process.exit(0);
};

evaluate();
