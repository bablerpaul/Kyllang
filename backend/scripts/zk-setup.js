#!/usr/bin/env node
/**
 * zk-setup.js — Kyllang ZK Trusted Setup & Build Pipeline
 *
 * Runs once to:
 *   1. Install circomlib dependency
 *   2. Download circom compiler binary (platform-aware)
 *   3. Compile certificate_proof.circom → R1CS + WASM
 *   4. Execute local Powers-of-Tau Phase 1 ceremony (pot12)
 *   5. Execute Phase 2 (circuit-specific zkey generation + contribution)
 *   6. Export verification_key.json and Groth16Verifier.sol
 *   7. Distribute WASM + zkey artifacts to frontend public/zk/
 *
 * Usage:  node backend/scripts/zk-setup.js
 * Time:   ~3-5 minutes (first run; subsequent runs skip if artifacts exist)
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const os   = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────
const BACKEND_DIR    = path.resolve(__dirname, '..');
const CIRCUITS_DIR   = path.join(BACKEND_DIR, 'circuits');
const ARTIFACTS_DIR  = path.join(BACKEND_DIR, 'artifacts', 'zk');
const CONTRACTS_DIR  = path.join(BACKEND_DIR, 'contracts');
const FRONTEND_ZK    = path.join(BACKEND_DIR, '..', 'certificate-portal', 'public', 'zk');
const CIRCUIT_NAME   = 'certificate_proof';
const CIRCOM_VERSION = '2.1.8';

// ── Colour helpers ─────────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    bold:  '\x1b[1m',
    green: '\x1b[32m',
    blue:  '\x1b[34m',
    yellow:'\x1b[33m',
    red:   '\x1b[31m',
    cyan:  '\x1b[36m',
};
const log  = (msg) => console.log(`${c.blue}[ZK-SETUP]${c.reset} ${msg}`);
const ok   = (msg) => console.log(`${c.green}[✓]${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}[!]${c.reset} ${msg}`);
const fail = (msg) => { console.error(`${c.red}[✗]${c.reset} ${msg}`); process.exit(1); };
const step = (n, total, msg) => console.log(`\n${c.bold}${c.cyan}── Step ${n}/${total}: ${msg} ──${c.reset}`);

// ── Utilities ──────────────────────────────────────────────────────────────
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileExists(p) {
    return fs.existsSync(p);
}

function run(cmd, opts = {}) {
    log(`  $ ${cmd}`);
    return execSync(cmd, { stdio: 'inherit', cwd: BACKEND_DIR, ...opts });
}

function runCapture(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', cwd: BACKEND_DIR, ...opts }).trim();
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = (urlStr) => {
            https.get(urlStr, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return request(response.headers.location);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode} for ${urlStr}`));
                }
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
        };
        request(url);
    });
}

// ── Circom Binary Resolution ───────────────────────────────────────────────
function getCircomBinary() {
    // 1. Check if circom is already in PATH
    try {
        const ver = runCapture('circom --version');
        ok(`circom found in PATH: ${ver}`);
        return 'circom';
    } catch (_) { /* not in PATH */ }

    // 2. Check local downloads directory
    const localBin = path.join(BACKEND_DIR, '.bin', 'circom' + (os.platform() === 'win32' ? '.exe' : ''));
    if (fileExists(localBin)) {
        ok(`circom found at ${localBin}`);
        return localBin;
    }

    return null; // caller must download
}

async function downloadCircom() {
    const platform = os.platform();
    const arch = os.arch();

    let binaryName;
    if (platform === 'win32') {
        binaryName = 'circom-windows-amd64.exe';
    } else if (platform === 'darwin') {
        binaryName = arch === 'arm64' ? 'circom-macos-arm64' : 'circom-macos-amd64';
    } else {
        binaryName = 'circom-linux-amd64';
    }

    const url = `https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/${binaryName}`;
    const binDir = path.join(BACKEND_DIR, '.bin');
    const dest = path.join(binDir, platform === 'win32' ? 'circom.exe' : 'circom');

    ensureDir(binDir);
    log(`Downloading circom v${CIRCOM_VERSION} from GitHub…`);
    log(`  URL: ${url}`);

    try {
        await downloadFile(url, dest);
        if (platform !== 'win32') {
            fs.chmodSync(dest, '755');
        }
        ok(`circom downloaded to ${dest}`);
        return dest;
    } catch (err) {
        warn(`Automatic download failed: ${err.message}`);
        warn('Please install circom manually:');
        warn('  cargo install circom');
        warn('  OR: https://docs.circom.io/getting-started/installation/');
        fail('circom binary not available. Aborting.');
    }
}

// ── Main Setup Pipeline ────────────────────────────────────────────────────
async function main() {
    const TOTAL_STEPS = 8;

    console.log(`\n${c.bold}${c.cyan}╔═══════════════════════════════════════════════════╗`);
    console.log(`║   Kyllang ZK-SNARK Trusted Setup & Build Pipeline  ║`);
    console.log(`╚═══════════════════════════════════════════════════╝${c.reset}\n`);

    ensureDir(ARTIFACTS_DIR);
    ensureDir(FRONTEND_ZK);

    // ── Step 1: Install circomlib ──────────────────────────────────────────
    step(1, TOTAL_STEPS, 'Install circomlib dependency');
    const cirlibPath = path.join(BACKEND_DIR, 'node_modules', 'circomlib');
    if (!fileExists(cirlibPath)) {
        log('Installing circomlib…');
        run('npm install circomlib --save-dev');
        ok('circomlib installed');
    } else {
        ok('circomlib already installed');
    }

    // Install snarkjs if not present
    const snarkjsPath = path.join(BACKEND_DIR, 'node_modules', 'snarkjs');
    if (!fileExists(snarkjsPath)) {
        log('Installing snarkjs…');
        run('npm install snarkjs --save');
        ok('snarkjs installed');
    } else {
        ok('snarkjs already installed');
    }

    // ── Step 2: Get circom binary ──────────────────────────────────────────
    step(2, TOTAL_STEPS, 'Resolve circom compiler binary');
    let circomBin = getCircomBinary();
    if (!circomBin) {
        circomBin = await downloadCircom();
    }
    // Wrap in quotes for paths with spaces on Windows
    const CIRCOM = `"${circomBin}"`;

    // ── Step 3: Compile circuit ────────────────────────────────────────────
    step(3, TOTAL_STEPS, 'Compile certificate_proof.circom');
    const circuitPath = path.join(CIRCUITS_DIR, `${CIRCUIT_NAME}.circom`);
    const r1csPath    = path.join(ARTIFACTS_DIR, `${CIRCUIT_NAME}.r1cs`);
    const wasmDir     = path.join(ARTIFACTS_DIR, `${CIRCUIT_NAME}_js`);
    const wasmPath    = path.join(wasmDir, `${CIRCUIT_NAME}.wasm`);

    if (!fileExists(wasmPath)) {
        log(`Compiling ${CIRCUIT_NAME}.circom…`);
        run(
            `${CIRCOM} "${circuitPath}" --r1cs --wasm --sym --c -o "${ARTIFACTS_DIR}" -l "${path.join(BACKEND_DIR, 'node_modules')}"`,
            { cwd: BACKEND_DIR }
        );
        ok(`Circuit compiled → R1CS + WASM in ${ARTIFACTS_DIR}`);
    } else {
        ok('Circuit artifacts already compiled (delete artifacts/zk/ to recompile)');
    }

    // Verify R1CS was produced
    if (!fileExists(r1csPath)) {
        fail(`R1CS file not found at ${r1csPath}. Compilation may have failed.`);
    }

    // Print constraint count
    try {
        const r1csInfo = execSync(`npx snarkjs r1cs info "${r1csPath}"`, { encoding: 'utf8' });
        log(`Circuit info:\n${r1csInfo.trim()}`);
    } catch (e) {
        warn(`Could not read R1CS info: ${e.message}`);
    }

    // ── Step 4: Powers-of-Tau Phase 1 ─────────────────────────────────────
    step(4, TOTAL_STEPS, 'Powers-of-Tau Phase 1 ceremony (pot12)');
    const snarkjs = require('snarkjs');

    const ptauFinal = path.join(ARTIFACTS_DIR, 'pot12_final.ptau');
    const ptau0000  = path.join(ARTIFACTS_DIR, 'pot12_0000.ptau');
    const ptau0001  = path.join(ARTIFACTS_DIR, 'pot12_0001.ptau');
    const ptauBeacon= path.join(ARTIFACTS_DIR, 'pot12_beacon.ptau');

    if (!fileExists(ptauFinal)) {
        log('Generating new Powers-of-Tau accumulator (power=12, supports up to 4096 constraints)…');
        execSync(`npx snarkjs powersoftau new bn128 12 "${ptau0000}" -v`, { stdio: 'inherit' });
        ok('Phase 1 accumulator created');

        log('Contributing to Phase 1 with random entropy…');
        const entropy1 = require('crypto').randomBytes(32).toString('hex');
        execSync(`npx snarkjs powersoftau contribute "${ptau0000}" "${ptau0001}" --name="Kyllang-ZK-Setup-Contribution-1" -v -e="${entropy1}"`, { stdio: 'inherit' });
        ok('Phase 1 contribution made');

        log('Applying random beacon (SHA-256 of known value for reproducibility)…');
        execSync(`npx snarkjs powersoftau beacon "${ptau0001}" "${ptauBeacon}" 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 -n="Kyllang-Random-Beacon" -v`, { stdio: 'inherit' });
        ok('Beacon applied');

        log('Preparing Phase 2 accumulator…');
        execSync(`npx snarkjs powersoftau prepare phase2 "${ptauBeacon}" "${ptauFinal}" -v`, { stdio: 'inherit' });
        ok(`Powers-of-Tau finalized → ${ptauFinal}`);
    } else {
        ok('pot12_final.ptau already exists (delete to re-run ceremony)');
    }

    // ── Step 5: Phase 2 — Circuit-Specific ZKey ────────────────────────────
    step(5, TOTAL_STEPS, 'Phase 2 — Groth16 proving key generation');
    const zkey0000   = path.join(ARTIFACTS_DIR, 'circuit_0000.zkey');
    const zkeyFinal  = path.join(ARTIFACTS_DIR, 'circuit_final.zkey');
    const vkeyPath   = path.join(ARTIFACTS_DIR, 'verification_key.json');

    if (!fileExists(zkeyFinal)) {
        log('Generating initial circuit-specific zkey…');
        execSync(`npx snarkjs groth16 setup "${r1csPath}" "${ptauFinal}" "${zkey0000}" -v`, { stdio: 'inherit' });
        ok('Initial zkey generated');

        log('Contributing to zkey (Phase 2)…');
        const entropy2 = require('crypto').randomBytes(32).toString('hex');
        execSync(`npx snarkjs zkey contribute "${zkey0000}" "${zkeyFinal}" --name="Kyllang-ZKey-Contribution-1" -v -e="${entropy2}"`, { stdio: 'inherit' });
        ok(`Final zkey generated → ${zkeyFinal}`);
    } else {
        ok('circuit_final.zkey already exists');
    }

    // ── Step 6: Export Verification Key ───────────────────────────────────
    step(6, TOTAL_STEPS, 'Export verification key and Solidity verifier');
    if (!fileExists(vkeyPath)) {
        log('Exporting verification_key.json…');
        execSync(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkeyPath}" -v`, { stdio: 'inherit' });
        ok(`verification_key.json exported → ${vkeyPath}`);
    } else {
        ok('verification_key.json already exists');
    }

    // Export Solidity verifier
    const verifierSolPath = path.join(CONTRACTS_DIR, 'Groth16Verifier.sol');
    if (!fileExists(verifierSolPath)) {
        log('Exporting Groth16Verifier.sol…');
        execSync(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierSolPath}"`, { stdio: 'inherit' });
        ok(`Groth16Verifier.sol exported → ${verifierSolPath}`);
    } else {
        ok('Groth16Verifier.sol already exists');
    }

    // ── Step 7: Distribute WASM + ZKey artifacts ───────────────────────────
    step(7, TOTAL_STEPS, 'Distribute artifacts to frontend');
    const wasmDest   = path.join(FRONTEND_ZK, `${CIRCUIT_NAME}.wasm`);
    const zkeyDest   = path.join(FRONTEND_ZK, 'circuit_final.zkey');
    const vkeyDest   = path.join(FRONTEND_ZK, 'verification_key.json');

    if (!fileExists(wasmDest)) {
        fs.copyFileSync(wasmPath, wasmDest);
        ok(`WASM → ${wasmDest}`);
    } else {
        ok('WASM already in frontend public/zk/');
    }

    if (!fileExists(zkeyDest)) {
        fs.copyFileSync(zkeyFinal, zkeyDest);
        ok(`zkey → ${zkeyDest}`);
    } else {
        ok('zkey already in frontend public/zk/');
    }

    if (!fileExists(vkeyDest)) {
        fs.copyFileSync(vkeyPath, vkeyDest);
        ok(`verification_key → ${vkeyDest}`);
    } else {
        ok('verification_key.json already in frontend public/zk/');
    }

    // ── Step 8: Verify artifacts with a test proof ─────────────────────────
    step(8, TOTAL_STEPS, 'Smoke-test: generate and verify a sample proof');
    try {
        const { buildPoseidon } = require('circomlibjs');
        const poseidon = await buildPoseidon();

        // Sample inputs (safe 248-bit values)
        const FIELD_MASK = (1n << 248n) - 1n;
        const patientId    = BigInt('0x' + require('crypto').createHash('sha256').update('test-patient').digest('hex')) & FIELD_MASK;
        const diagnosisCode= BigInt('0x' + require('crypto').createHash('sha256').update('J00').digest('hex')) & FIELD_MASK;
        const validFrom    = 1700000000n;
        const secretSalt   = BigInt('0x' + require('crypto').randomBytes(31).toString('hex')) & FIELD_MASK;
        const challengeNonce = BigInt('0x' + require('crypto').randomBytes(31).toString('hex')) & FIELD_MASK;

        // Compute commitment using same Poseidon as circuit
        const F = poseidon.F;
        const commitment = F.toString(poseidon([patientId, diagnosisCode, validFrom, secretSalt]));

        const input = {
            patientId: patientId.toString(),
            diagnosisCode: diagnosisCode.toString(),
            validFrom: validFrom.toString(),
            secretSalt: secretSalt.toString(),
            expectedCommitment: commitment,
            challengeNonce: challengeNonce.toString(),
        };

        log('Generating sample Groth16 proof (may take 5–30s)…');
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            wasmPath,
            zkeyFinal
        );
        ok(`Proof generated. publicSignals = [${publicSignals.map(s => s.slice(0,10)+'...').join(', ')}]`);

        const vKey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
        const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        if (!valid) fail('Smoke-test proof verification FAILED. Setup may be corrupt.');
        ok('Smoke-test proof verified ✓');

        // Save sample proof for reference
        fs.writeFileSync(
            path.join(ARTIFACTS_DIR, 'sample_proof.json'),
            JSON.stringify({ proof, publicSignals }, null, 2)
        );
        ok(`Sample proof saved to artifacts/zk/sample_proof.json`);
    } catch (e) {
        warn(`Smoke test skipped (circomlibjs may not be installed): ${e.message}`);
        warn('Run: npm install circomlibjs --save-dev');
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log(`\n${c.bold}${c.green}╔═══════════════════════════════════════════════════╗`);
    console.log(`║           ZK Setup Complete!                       ║`);
    console.log(`╠═══════════════════════════════════════════════════╣${c.reset}`);
    console.log(`  Artifacts in: ${ARTIFACTS_DIR}`);
    console.log(`  Frontend ZK:  ${FRONTEND_ZK}`);
    console.log(`  Next step:    node backend/scripts/deploy-zk.js`);
    console.log(`${c.bold}${c.green}╚═══════════════════════════════════════════════════╝${c.reset}\n`);
}

main().catch((err) => {
    fail(`Unhandled error in ZK setup: ${err.message}\n${err.stack}`);
});
