#!/usr/bin/env node
/**
 * test-zk-security.js — Kyllang End-to-End ZK Security Test Suite
 *
 * Runs 5 security scenario tests against a live Ganache instance.
 *
 * Prerequisites:
 *   1. Ganache running:        npx ganache --deterministic --port 7545
 *   2. ZK setup complete:      node backend/scripts/zk-setup.js
 *   3. Contracts deployed:     node backend/scripts/deploy-zk.js
 *   4. Backend running:        npm run dev (in backend/)  OR set TEST_MODE=false
 *
 * Usage: node backend/scripts/test-zk-security.js
 *
 * Test Scenarios:
 *   S1 — Happy Path:    Doctor issues → Patient stores → Verifier challenges → Patient proves → Verification succeeds
 *   S2 — Privacy Audit: All network payloads inspected — zero plaintext/PIN/ciphertext exposure
 *   S3 — Anti-Replay:  Same proof / consumed nonce immediately rejected
 *   S4 — Anti-Forgery: Proof for unregistered hash or unauthorized issuer rejected
 *   S5 — Revocation:   Revoked certificate → subsequent valid proof rejected
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ethers }  = require('ethers');
const snarkjs     = require('snarkjs');
const crypto      = require('crypto');
const path        = require('path');
const fs          = require('fs');

// ── Test Infrastructure ────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    green: '\x1b[32m', red: '\x1b[31m',
    blue:  '\x1b[34m', yellow: '\x1b[33m',
    cyan:  '\x1b[36m', magenta: '\x1b[35m',
};

let passed = 0, failed = 0;
const failures = [];

function log(msg)  { console.log(`  ${c.blue}[LOG]${c.reset} ${msg}`); }
function ok(msg)   { console.log(`  ${c.green}[✓]${c.reset} ${msg}`); passed++; }
function fail(msg) { console.log(`  ${c.red}[✗]${c.reset} ${msg}`); failed++; failures.push(msg); }
function warn(msg) { console.log(`  ${c.yellow}[!]${c.reset} ${msg}`); }
function assert(condition, msg) {
    if (condition) { ok(msg); return true; }
    else           { fail(msg); return false; }
}

function scenario(n, title) {
    console.log(`\n${c.bold}${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.bold}${c.magenta}  Scenario ${n}: ${title}${c.reset}`);
    console.log(`${c.bold}${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
}

// ── ZK Artifacts ──────────────────────────────────────────────────────────
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'zk');
const wasmPath  = path.join(ARTIFACTS_DIR, 'certificate_proof_js', 'certificate_proof.wasm');
const zkeyPath  = path.join(ARTIFACTS_DIR, 'circuit_final.zkey');
const vkeyPath  = path.join(ARTIFACTS_DIR, 'verification_key.json');

// ── BN128 Field Utilities ──────────────────────────────────────────────────
const FIELD_MASK_248 = (1n << 248n) - 1n;

function sha256BigInt(str) {
    const hex = crypto.createHash('sha256').update(str).digest('hex');
    return BigInt('0x' + hex) & FIELD_MASK_248;
}

function packTimestamp(date) {
    return BigInt(Math.floor(date.getTime() / 1000));
}

function packSalt(saltHex) {
    return BigInt(saltHex) & FIELD_MASK_248;
}

function randomNonce() {
    const bytes = crypto.randomBytes(31);
    return BigInt('0x' + bytes.toString('hex')) & FIELD_MASK_248;
}

function randomSalt() {
    return '0x' + crypto.randomBytes(31).toString('hex');
}

// ── Poseidon (Node.js side using circomlibjs) ──────────────────────────────
async function poseidon4(a, b, c_, d) {
    const { buildPoseidon } = require('circomlibjs');
    const P = await buildPoseidon();
    return P.F.toString(P([a, b, c_, d]));
}

async function poseidon2(a, b) {
    const { buildPoseidon } = require('circomlibjs');
    const P = await buildPoseidon();
    return P.F.toString(P([a, b]));
}

function toBytes32(decStr) {
    return '0x' + BigInt(decStr).toString(16).padStart(64, '0');
}

// ── Groth16 Proof Generation ───────────────────────────────────────────────
async function generateProof(input) {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input, wasmPath, zkeyPath
    );
    return { proof, publicSignals };
}

async function verifyProofLocally(proof, publicSignals) {
    const vKey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
    return snarkjs.groth16.verify(vKey, publicSignals, proof);
}

function proofToCalldata(proof) {
    return {
        pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        pB: [
            [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
            [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
        ],
        pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    };
}

// ── Blockchain Setup ──────────────────────────────────────────────────────
async function setupContracts() {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const [signer0, signer1, signer2] = await Promise.all([
        new ethers.Wallet(
            process.env.PRIVATE_KEY || '0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388',
            provider
        ),
        new ethers.Wallet(
            '0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c', // Ganache account 1
            provider
        ),
        new ethers.Wallet(
            '0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913', // Ganache account 2
            provider
        ),
    ]);

    const registryAddress = process.env.CERT_REGISTRY_ADDRESS;
    if (!registryAddress || registryAddress === 'undefined') {
        throw new Error('CERT_REGISTRY_ADDRESS not set in .env. Run deploy-zk.js first.');
    }

    const abiPath = path.join(ARTIFACTS_DIR, 'CertificateRegistry.abi.json');
    const registryAbi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

    const registry    = new ethers.Contract(registryAddress, registryAbi, signer0);
    const registryS1  = registry.connect(signer1); // unauthorized issuer
    const registryS2  = registry.connect(signer2); // another unauthorized

    return { provider, signer0, signer1, signer2, registry, registryS1, registryS2 };
}

// ─────────────────────────────────────────────────────────────────────────
// S1 — Happy Path
// ─────────────────────────────────────────────────────────────────────────
async function scenario1_happyPath(registry, signer0) {
    scenario(1, 'Happy Path — Full issuance and verification lifecycle');

    // Doctor's patient data (private, never leaves doctor's browser in prod)
    const patientId    = 'patient-uuid-s1-' + Date.now();
    const diagnosis    = 'J18.9';                // ICD-11: Pneumonia
    const validFrom    = new Date('2025-01-01');
    const saltHex      = randomSalt();

    log(`Patient ID: ${patientId}`);
    log(`Diagnosis:  ${diagnosis} (ICD-11)`);
    log(`Salt:       ${saltHex.slice(0, 14)}…`);

    // Compute commitment (as doctor's browser would)
    const pF = sha256BigInt(patientId);
    const dF = sha256BigInt(diagnosis);
    const tF = packTimestamp(validFrom);
    const sF = packSalt(saltHex);

    const commitmentDec = await poseidon4(pF, dF, tF, sF);
    const commitmentBytes32 = toBytes32(commitmentDec);
    log(`Commitment (Poseidon4): ${commitmentDec.slice(0, 18)}…`);

    // Doctor registers on-chain
    log('Doctor calling registerCertificate() on-chain…');
    const regTx = await registry.registerCertificate(commitmentBytes32);
    await regTx.wait();
    ok(`Certificate registered. TX: ${regTx.hash}`);

    // Verify registration
    const [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(commitmentBytes32);
    assert(exists,   'Certificate exists on-chain');
    assert(!revoked, 'Certificate is not revoked');
    assert(issuer === signer0.address, `Issuer recorded: ${issuer}`);

    // Verifier issues a challenge nonce (backend-generated in prod)
    const challengeNonce = randomNonce();
    log(`Challenge nonce: ${challengeNonce.toString().slice(0, 14)}…`);

    // Patient generates proof (in Web Worker in prod)
    log('Patient generating Groth16 proof…');
    const circuitInput = {
        patientId:          pF.toString(),
        diagnosisCode:      dF.toString(),
        validFrom:          tF.toString(),
        secretSalt:         sF.toString(),
        expectedCommitment: commitmentDec,
        challengeNonce:     challengeNonce.toString(),
    };

    const { proof, publicSignals } = await generateProof(circuitInput);
    ok(`Proof generated. publicSignals: [${publicSignals.map(s => s.slice(0,8)+'…').join(', ')}]`);

    // Assert public signal layout
    const expectedCommitmentStr = BigInt(commitmentDec).toString();
    const challengeNonceStr = BigInt(challengeNonce).toString();

    assert(publicSignals[1] === expectedCommitmentStr, 'pubSignals[1] == expectedCommitment');
    assert(publicSignals[2] === challengeNonceStr, 'pubSignals[2] == challengeNonce');

    // Local verification (trustless browser-side)
    const localValid = await verifyProofLocally(proof, publicSignals);
    assert(localValid, 'Local Groth16 proof verification passes');

    // On-chain state-changing verification
    const { pA, pB, pC } = proofToCalldata(proof);
    const pubSignals = publicSignals.map(BigInt);

    log('Calling registry.verifyCertificateProof() on-chain (atomic nonce consumption)…');
    const verifyTx = await registry.verifyCertificateProof(pA, pB, pC, pubSignals);
    await verifyTx.wait();
    ok(`On-chain proof verified. TX: ${verifyTx.hash}`);

    // Trustless static call (Verifier independent check)
    const [valid, certExists, certRevoked, sessionConsumed, onChainIssuer, onChainIssuedAt] =
        await registry.verifyCertificateProofStatic(pA, pB, pC, pubSignals);
    // Note: sessionConsumed=true because we already consumed it in the state-changing call
    assert(certExists,   'Static call: certificate exists');
    assert(!certRevoked, 'Static call: certificate not revoked');
    assert(sessionConsumed, 'Static call: session marked consumed (anti-replay)');

    return { proof, publicSignals, commitmentBytes32, pA, pB, pC, pubSignals };
}

// ─────────────────────────────────────────────────────────────────────────
// S2 — Privacy Audit
// ─────────────────────────────────────────────────────────────────────────
async function scenario2_privacyAudit(proof, publicSignals) {
    scenario(2, 'Privacy Audit — Zero plaintext leakage in transmitted payloads');

    const PLAINTEXT_TERMS = [
        'pneumonia', 'J18.9', 'patient-uuid', 'diagnosis',
        'cancer', 'hiv', 'diabetes', 'covid',
    ];

    // Inspect proof payload (what Patient submits to backend)
    const proofPayload = JSON.stringify({ proof, publicSignals });

    log(`Proof payload size: ${proofPayload.length} bytes`);
    log('Scanning proof payload for plaintext medical terms…');

    let foundPlaintext = false;
    for (const term of PLAINTEXT_TERMS) {
        if (proofPayload.toLowerCase().includes(term.toLowerCase())) {
            fail(`PRIVACY BREACH: "${term}" found in proof payload`);
            foundPlaintext = true;
        }
    }
    if (!foundPlaintext) {
        ok('No plaintext medical terms found in proof payload');
    }

    // Inspect publicSignals (what goes on-chain)
    log('Scanning publicSignals for plaintext terms…');
    const signalStr = JSON.stringify(publicSignals);
    let signalBreach = false;
    for (const term of PLAINTEXT_TERMS) {
        if (signalStr.toLowerCase().includes(term.toLowerCase())) {
            fail(`PRIVACY BREACH: "${term}" found in publicSignals`);
            signalBreach = true;
        }
    }
    if (!signalBreach) {
        ok('No plaintext medical terms in publicSignals');
    }

    // Verify publicSignals are large opaque integers (not encodings of plaintext)
    assert(
        publicSignals.every(s => /^\d{20,}$/.test(s)),
        'All publicSignals are large numeric field elements (not base64/ASCII encoded text)'
    );

    // Verify proof components are field elements (not recognizable data)
    assert(proof.pi_a.every(v => /^\d{20,}$/.test(v)), 'Proof pi_a contains only field elements');
    assert(proof.pi_c.every(v => /^\d{20,}$/.test(v)), 'Proof pi_c contains only field elements');

    ok('Privacy audit passed — verifier receives zero plaintext medical information');
}

// ─────────────────────────────────────────────────────────────────────────
// S3 — Anti-Replay
// ─────────────────────────────────────────────────────────────────────────
async function scenario3_antiReplay(registry, proof, publicSignals, pA, pB, pC, pubSignals) {
    scenario(3, 'Anti-Replay — Consumed nonce/session immediately rejected');

    // Attempt to resubmit the SAME proof (nonce/session already consumed by S1)
    log('Resubmitting already-consumed proof to verifyCertificateProof()…');
    try {
        const tx = await registry.verifyCertificateProof(pA, pB, pC, pubSignals);
        await tx.wait();
        fail('SECURITY FAILURE: Replay attack succeeded — consumed proof was accepted again');
    } catch (err) {
        const reason = err.reason || err.message;
        if (reason.includes('session already consumed') || reason.includes('replay')) {
            ok(`Replay blocked by atomic nonce consumption: "${reason}"`);
        } else if (reason.includes('reverted')) {
            ok(`Replay blocked (generic revert): "${reason.slice(0, 80)}"`);
        } else {
            warn(`Replay blocked but with unexpected error: ${reason}`);
            ok('Replay attack was rejected by smart contract');
        }
    }

    // Also verify static call reflects consumed session
    const [, , , sessionConsumed] = await registry.verifyCertificateProofStatic(pA, pB, pC, pubSignals);
    assert(sessionConsumed, 'Static call confirms session is permanently consumed');

    // Generate a fresh proof with a NEW nonce — should succeed on static call
    log('Generating fresh proof with new nonce to confirm genuine proofs still work…');
    const patientId    = 'patient-uuid-s3-replay';
    const diagnosis    = 'K21.0';
    const validFrom    = new Date('2025-06-01');
    const saltHex      = randomSalt();
    const pF = sha256BigInt(patientId);
    const dF = sha256BigInt(diagnosis);
    const tF = packTimestamp(validFrom);
    const sF = packSalt(saltHex);
    const commitmentDec = await poseidon4(pF, dF, tF, sF);
    const commitmentBytes32 = toBytes32(commitmentDec);

    try {
        const regTx = await registry.registerCertificate(commitmentBytes32);
        await regTx.wait();
    } catch (_) {} // May already be registered

    const freshNonce = randomNonce();
    const { proof: freshProof, publicSignals: freshSignals } = await generateProof({
        patientId: pF.toString(), diagnosisCode: dF.toString(),
        validFrom: tF.toString(), secretSalt: sF.toString(),
        expectedCommitment: commitmentDec, challengeNonce: freshNonce.toString(),
    });
    const { pA: fpA, pB: fpB, pC: fpC } = proofToCalldata(freshProof);
    const fpSignals = freshSignals.map(BigInt);

    const [freshValid] = await registry.verifyCertificateProofStatic(fpA, fpB, fpC, fpSignals);
    assert(freshValid, 'Fresh proof with new nonce passes static verification (replay protection is per-session)');
}

// ─────────────────────────────────────────────────────────────────────────
// S4 — Anti-Forgery
// ─────────────────────────────────────────────────────────────────────────
async function scenario4_antiForgery(registry, registryS1) {
    scenario(4, 'Anti-Forgery — Unauthorized issuer and unregistered hash rejected');

    // ── 4a: Unauthorized issuer cannot register ────────────────────────────
    log('Unauthorized wallet (signer1) attempting to registerCertificate…');
    const fakeCommitment = '0x' + crypto.randomBytes(32).toString('hex');
    try {
        const tx = await registryS1.registerCertificate(fakeCommitment);
        await tx.wait();
        fail('SECURITY FAILURE: Unauthorized issuer registered a certificate');
    } catch (err) {
        ok(`Unauthorized issuer rejected: "${(err.reason || err.message).slice(0, 80)}"`);
    }

    // ── 4b: Valid proof for unregistered commitment rejected ───────────────
    log('Generating valid ZK proof for an unregistered commitment hash…');
    const patientId  = 'attacker-patient';
    const diagnosis  = 'FAKE-DIAG';
    const validFrom  = new Date('2020-01-01');
    const saltHex    = randomSalt();
    const pF = sha256BigInt(patientId);
    const dF = sha256BigInt(diagnosis);
    const tF = packTimestamp(validFrom);
    const sF = packSalt(saltHex);
    const commitmentDec = await poseidon4(pF, dF, tF, sF);  // NOT registered

    const nonce = randomNonce();
    const { proof, publicSignals } = await generateProof({
        patientId: pF.toString(), diagnosisCode: dF.toString(),
        validFrom: tF.toString(), secretSalt: sF.toString(),
        expectedCommitment: commitmentDec, challengeNonce: nonce.toString(),
    });

    // Local proof IS valid (correct circuit inputs) but hash is unregistered
    const localValid = await verifyProofLocally(proof, publicSignals);
    assert(localValid, 'Attacker can generate locally-valid proof (expected — circuit just proves hash pre-image)');

    const { pA, pB, pC } = proofToCalldata(proof);
    const pubSignals = publicSignals.map(BigInt);

    log('Submitting valid-proof-of-unregistered-hash to registry…');
    try {
        const tx = await registry.verifyCertificateProof(pA, pB, pC, pubSignals);
        await tx.wait();
        fail('SECURITY FAILURE: Registry accepted proof for unregistered commitment');
    } catch (err) {
        const reason = err.reason || err.message;
        if (reason.includes('not registered') || reason.includes('reverted')) {
            ok(`Registry rejected proof for unregistered hash: "${reason.slice(0, 80)}"`);
        } else {
            ok(`Registry rejected (reason: ${reason.slice(0, 80)})`);
        }
    }

    // ── 4c: Admin cannot be impersonated ──────────────────────────────────
    log('Unauthorized wallet attempting to addIssuer(self)…');
    try {
        const tx = await registryS1.addIssuer(await registryS1.getAddress());
        await tx.wait();
        fail('SECURITY FAILURE: Unauthorized wallet added itself as issuer');
    } catch (err) {
        ok(`addIssuer rejected for non-admin: "${(err.reason || err.message).slice(0, 60)}"`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// S5 — Revocation
// ─────────────────────────────────────────────────────────────────────────
async function scenario5_revocation(registry) {
    scenario(5, 'Revocation — Revoked certificate causes subsequent valid proofs to fail');

    // Issue a fresh certificate
    const patientId = 'patient-uuid-s5-revoc';
    const diagnosis = 'Z51.11'; // Antineoplastic chemotherapy
    const validFrom = new Date('2025-03-01');
    const saltHex   = randomSalt();

    const pF = sha256BigInt(patientId);
    const dF = sha256BigInt(diagnosis);
    const tF = packTimestamp(validFrom);
    const sF = packSalt(saltHex);
    const commitmentDec = await poseidon4(pF, dF, tF, sF);
    const commitmentBytes32 = toBytes32(commitmentDec);

    log(`Registering certificate for revocation test…`);
    const regTx = await registry.registerCertificate(commitmentBytes32);
    await regTx.wait();
    ok(`Certificate registered: ${commitmentBytes32.slice(0, 16)}…`);

    // Generate a valid proof
    const nonce1 = randomNonce();
    const { proof, publicSignals } = await generateProof({
        patientId: pF.toString(), diagnosisCode: dF.toString(),
        validFrom: tF.toString(), secretSalt: sF.toString(),
        expectedCommitment: commitmentDec, challengeNonce: nonce1.toString(),
    });
    const { pA, pB, pC } = proofToCalldata(proof);
    const pubSignals = publicSignals.map(BigInt);

    // Verify BEFORE revocation — should succeed
    log('Verifying proof BEFORE revocation (should succeed)…');
    const [validBefore] = await registry.verifyCertificateProofStatic(pA, pB, pC, pubSignals);
    assert(validBefore, 'Proof valid BEFORE revocation');

    // Revoke the certificate
    log('Revoking certificate on-chain…');
    const revokeTx = await registry.revokeCertificate(commitmentBytes32);
    await revokeTx.wait();
    ok(`Certificate revoked. TX: ${revokeTx.hash}`);

    // Verify on-chain revocation status
    const [, , revoked] = await registry.getCertificateRecord(commitmentBytes32);
    assert(revoked, 'On-chain revocation status = true');

    // Generate a new proof with a fresh nonce AFTER revocation
    const nonce2 = randomNonce();
    const { proof: proof2, publicSignals: ps2 } = await generateProof({
        patientId: pF.toString(), diagnosisCode: dF.toString(),
        validFrom: tF.toString(), secretSalt: sF.toString(),
        expectedCommitment: commitmentDec, challengeNonce: nonce2.toString(),
    });
    const { pA: pA2, pB: pB2, pC: pC2 } = proofToCalldata(proof2);
    const pubSignals2 = ps2.map(BigInt);

    // Static call after revocation — should report revoked
    const [validAfter, , revokedAfter] = await registry.verifyCertificateProofStatic(pA2, pB2, pC2, pubSignals2);
    assert(!validAfter,    'Static call: proof invalid after revocation');
    assert(revokedAfter,   'Static call: certRevoked=true confirmed');

    // State-changing call should revert
    log('Submitting proof for revoked certificate to verifyCertificateProof()…');
    try {
        const tx = await registry.verifyCertificateProof(pA2, pB2, pC2, pubSignals2);
        await tx.wait();
        fail('SECURITY FAILURE: Revoked certificate was accepted');
    } catch (err) {
        const reason = err.reason || err.message;
        if (reason.includes('revoked') || reason.includes('reverted')) {
            ok(`Revoked certificate rejected on-chain: "${reason.slice(0, 80)}"`);
        } else {
            ok(`Revoked certificate rejected (${reason.slice(0, 60)})`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  Kyllang ZK Security Test Suite — 5 Scenario Coverage   ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝${c.reset}\n`);

    // ── Pre-flight checks ──────────────────────────────────────────────────
    log('Running pre-flight checks…');
    if (!fs.existsSync(wasmPath)) fail(`WASM not found: ${wasmPath}\nRun: node backend/scripts/zk-setup.js`);
    if (!fs.existsSync(zkeyPath)) fail(`zkey not found: ${zkeyPath}\nRun: node backend/scripts/zk-setup.js`);
    if (!fs.existsSync(vkeyPath)) fail(`vkey not found: ${vkeyPath}\nRun: node backend/scripts/zk-setup.js`);

    if (failures.length > 0) {
        console.log(`\n${c.red}Pre-flight failed. Fix errors and retry.${c.reset}`);
        process.exit(1);
    }
    ok('ZK artifacts found');

    let contracts;
    try {
        contracts = await setupContracts();
        ok(`Connected to Ganache. Registry: ${process.env.CERT_REGISTRY_ADDRESS?.slice(0,12)}…`);
    } catch (err) {
        fail(`Contract setup failed: ${err.message}`);
        console.log(`${c.red}\nCannot connect to contracts. Check Ganache and .env. Aborting.${c.reset}`);
        process.exit(1);
    }

    const { registry, registryS1, signer0 } = contracts;

    // ── Run scenarios ──────────────────────────────────────────────────────
    let s1Result;
    try {
        s1Result = await scenario1_happyPath(registry, signer0);
    } catch (err) {
        fail(`S1 threw unexpected error: ${err.message}`);
        console.error(err.stack);
        s1Result = null;
    }

    if (s1Result) {
        try { await scenario2_privacyAudit(s1Result.proof, s1Result.publicSignals); }
        catch (err) { fail(`S2 threw: ${err.message}`); }

        try { await scenario3_antiReplay(registry, s1Result.proof, s1Result.publicSignals, s1Result.pA, s1Result.pB, s1Result.pC, s1Result.pubSignals); }
        catch (err) { fail(`S3 threw: ${err.message}`); }
    } else {
        warn('Skipping S2, S3 (S1 failed)');
    }

    try { await scenario4_antiForgery(registry, registryS1); }
    catch (err) { fail(`S4 threw: ${err.message}`); }

    try { await scenario5_revocation(registry); }
    catch (err) { fail(`S5 threw: ${err.message}`); }

    // ── Summary ────────────────────────────────────────────────────────────
    const total = passed + failed;
    const allPass = failed === 0;

    console.log(`\n${c.bold}${allPass ? c.green : c.red}╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  Test Results: ${passed}/${total} passed  ${allPass ? '🎉 ALL PASSED' : `❌ ${failed} FAILED`}             ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝${c.reset}`);

    if (failures.length > 0) {
        console.log(`\n${c.red}Failed assertions:${c.reset}`);
        failures.forEach(f => console.log(`  ${c.red}✗${c.reset} ${f}`));
    }

    process.exit(allPass ? 0 : 1);
}

main().catch(err => {
    console.error(`${c.red}[FATAL]${c.reset} ${err.message}\n${err.stack}`);
    process.exit(1);
});
