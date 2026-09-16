#!/usr/bin/env node
/**
 * deploy-zk.js — Kyllang ZK Smart Contract Deployment
 *
 * Deploys to local Ganache (http://127.0.0.1:7545):
 *   1. Compiles Groth16Verifier.sol (snarkjs-generated)
 *   2. Compiles CertificateRegistry.sol
 *   3. Deploys Groth16Verifier → gets address
 *   4. Deploys CertificateRegistry(verifierAddress)
 *   5. Calls addIssuer(wallet.address) to self-authorize deployer
 *   6. Writes GROTH16_VERIFIER_ADDRESS, CERT_REGISTRY_ADDRESS to .env
 *   7. Writes contract ABIs to artifacts/zk/ for frontend use
 *
 * Prerequisites:
 *   - Ganache running:  npx ganache --deterministic --port 7545
 *   - ZK setup done:   node backend/scripts/zk-setup.js
 *
 * Usage:   node backend/scripts/deploy-zk.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ethers } = require('ethers');
const solc       = require('solc');
const fs         = require('fs');
const path       = require('path');

// ── Paths ──────────────────────────────────────────────────────────────────
const BACKEND_DIR    = path.resolve(__dirname, '..');
const CONTRACTS_DIR  = path.join(BACKEND_DIR, 'contracts');
const ARTIFACTS_DIR  = path.join(BACKEND_DIR, 'artifacts', 'zk');
const FRONTEND_ZK    = path.join(BACKEND_DIR, '..', 'certificate-portal', 'public', 'zk');
const ENV_PATH       = path.join(BACKEND_DIR, '.env');

// ── Colour helpers ─────────────────────────────────────────────────────────
const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };
const log  = (m) => console.log(`${c.blue}[DEPLOY]${c.reset} ${m}`);
const ok   = (m) => console.log(`${c.green}[✓]${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}[!]${c.reset} ${m}`);
const fail = (m) => { console.error(`${c.red}[✗]${c.reset} ${m}`); process.exit(1); };

// ── Solc Compiler Wrapper ──────────────────────────────────────────────────
function compileSolidity(fileName, source) {
    log(`Compiling ${fileName}…`);

    const input = {
        language: 'Solidity',
        sources: { [fileName]: { content: source } },
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: 'paris',
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length) {
            errors.forEach(e => console.error(e.formattedMessage));
            fail(`Compilation of ${fileName} failed with errors`);
        }
        output.errors.filter(e => e.severity === 'warning').forEach(e => warn(e.formattedMessage));
    }

    const contractName = fileName.replace('.sol', '');
    const compiled = output.contracts[fileName][contractName];
    if (!compiled) fail(`Contract ${contractName} not found in compiled output`);

    ok(`${fileName} compiled (${compiled.evm.bytecode.object.length / 2} bytes)`);
    return { abi: compiled.abi, bytecode: '0x' + compiled.evm.bytecode.object };
}

// ── .env Updater ───────────────────────────────────────────────────────────
function updateEnv(updates) {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';

    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content += `\n${key}=${value}`;
        }
    }

    fs.writeFileSync(ENV_PATH, content.trim() + '\n', 'utf8');
}

// ── Main Deployment ────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${c.bold}${c.cyan}╔═══════════════════════════════════════════════════╗`);
    console.log(`║    Kyllang ZK Contract Deployment to Ganache       ║`);
    console.log(`╚═══════════════════════════════════════════════════╝${c.reset}\n`);

    // ── Provider + Wallet ──────────────────────────────────────────────────
    const rpcUrl     = process.env.RPC_URL     || 'http://127.0.0.1:7545';
    const privateKey = process.env.PRIVATE_KEY || '0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388';

    log(`Connecting to ${rpcUrl}…`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {
        const blockNum = await provider.getBlockNumber();
        ok(`Connected to Ganache at block ${blockNum}`);
    } catch (e) {
        fail(`Cannot connect to Ganache at ${rpcUrl}. Start it with:\n  npx ganache --deterministic --port 7545`);
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    log(`Deployer wallet: ${wallet.address}`);
    const balance = ethers.formatEther(await provider.getBalance(wallet.address));
    log(`Wallet balance: ${balance} ETH`);

    // ── Verify ZK setup artifacts exist ───────────────────────────────────
    const groth16SolPath = path.join(CONTRACTS_DIR, 'Groth16Verifier.sol');
    if (!fs.existsSync(groth16SolPath)) {
        fail('Groth16Verifier.sol not found. Run: node backend/scripts/zk-setup.js first');
    }

    // ── Step 1: Compile & Deploy Groth16Verifier ───────────────────────────
    log('\n── Step 1: Groth16Verifier ────────────────────────────');
    const groth16Source = fs.readFileSync(groth16SolPath, 'utf8');
    const { abi: verifierAbi, bytecode: verifierBytecode } = compileSolidity('Groth16Verifier.sol', groth16Source);

    const verifierFactory = new ethers.ContractFactory(verifierAbi, verifierBytecode, wallet);
    log('Deploying Groth16Verifier…');
    const baseNonce = await provider.getTransactionCount(wallet.address, 'latest');
    const verifierContract = await verifierFactory.deploy({ nonce: baseNonce });
    await verifierContract.waitForDeployment();
    const verifierAddress = await verifierContract.getAddress();
    ok(`Groth16Verifier deployed → ${verifierAddress}`);

    // ── Step 2: Compile & Deploy CertificateRegistry ──────────────────────
    log('\n── Step 2: CertificateRegistry ────────────────────────');
    const registrySource = fs.readFileSync(path.join(CONTRACTS_DIR, 'CertificateRegistry.sol'), 'utf8');
    const { abi: registryAbi, bytecode: registryBytecode } = compileSolidity('CertificateRegistry.sol', registrySource);

    const registryFactory = new ethers.ContractFactory(registryAbi, registryBytecode, wallet);
    log('Deploying CertificateRegistry…');
    const registryContract = await registryFactory.deploy(verifierAddress, { nonce: baseNonce + 1 });
    await registryContract.waitForDeployment();
    const registryAddress = await registryContract.getAddress();
    ok(`CertificateRegistry deployed → ${registryAddress}`);

    // ── Step 3: Verify deployer is authorized issuer (auto-authorized in constructor)
    log('\n── Step 3: Verify issuer authorization ────────────────');
    const isAuthorized = await registryContract.authorizedIssuers(wallet.address);
    if (isAuthorized) {
        ok(`Deployer ${wallet.address} is authorized as issuer`);
    } else {
        warn('Deployer not auto-authorized. Calling addIssuer…');
        const tx = await registryContract.addIssuer(wallet.address);
        await tx.wait();
        ok(`addIssuer(${wallet.address}) confirmed`);
    }

    // ── Step 4: Save ABIs for backend and frontend ─────────────────────────
    log('\n── Step 4: Save ABIs ──────────────────────────────────');

    // Save ABIs to artifacts
    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'Groth16Verifier.abi.json'),
        JSON.stringify(verifierAbi, null, 2)
    );
    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'CertificateRegistry.abi.json'),
        JSON.stringify(registryAbi, null, 2)
    );

    // Save to frontend for trustless ethers.js calls
    const frontendAbiPath = path.join(FRONTEND_ZK, 'CertificateRegistry.abi.json');
    fs.writeFileSync(frontendAbiPath, JSON.stringify({
        registryAddress,
        verifierAddress,
        abi: registryAbi
    }, null, 2));
    ok(`Frontend ABI manifest saved → ${frontendAbiPath}`);

    // ── Step 5: Update .env ────────────────────────────────────────────────
    log('\n── Step 5: Update .env ────────────────────────────────');
    updateEnv({
        GROTH16_VERIFIER_ADDRESS: verifierAddress,
        CERT_REGISTRY_ADDRESS:    registryAddress,
        REGISTRY_ADMIN_KEY:       privateKey,
    });
    ok('.env updated with contract addresses');

    // ── Summary ────────────────────────────────────────────────────────────
    console.log(`\n${c.bold}${c.green}╔═══════════════════════════════════════════════════╗`);
    console.log(`║        Deployment Complete!                        ║`);
    console.log(`╠═══════════════════════════════════════════════════╣${c.reset}`);
    console.log(`  Groth16Verifier:      ${verifierAddress}`);
    console.log(`  CertificateRegistry:  ${registryAddress}`);
    console.log(`  Deployer/Admin:       ${wallet.address}`);
    console.log(`  Next step: npm run dev (in both backend/ and certificate-portal/)`);
    console.log(`${c.bold}${c.green}╚═══════════════════════════════════════════════════╝${c.reset}\n`);
}

main().catch((err) => {
    fail(`Deployment failed: ${err.message}\n${err.stack}`);
});
