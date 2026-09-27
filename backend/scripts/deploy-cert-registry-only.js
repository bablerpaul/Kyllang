#!/usr/bin/env node
'use strict';
/**
 * deploy-cert-registry-only.js — deploy ONLY a CertificateRegistry against the local Ganache chain.
 *
 * Required environment (from backend/.env or the shell) — there are NO fallbacks:
 *   PRIVATE_KEY               deployer wallet key (never printed)
 *   RPC_URL                   JSON-RPC endpoint (e.g. the local Ganache workspace)
 *   GROTH16_VERIFIER_ADDRESS  address of an ALREADY-DEPLOYED Groth16Verifier contract
 * Optional:
 *   EXPECTED_CHAIN_ID         default 1337 (the local Ganache chain); deployment aborts on any other chain
 *   MIN_DEPLOYER_BALANCE_ETH  default 0.1
 *
 * Usage:
 *   node scripts/deploy-cert-registry-only.js --check           pre-flight only: read-only RPC + compile + gas
 *                                                               estimate. Sends NO transaction, writes NO file.
 *   node scripts/deploy-cert-registry-only.js                   deploy, verify, then (only if EVERY check passed)
 *                                                               update CERT_REGISTRY_ADDRESS in .env and the backend ABI.
 *   node scripts/deploy-cert-registry-only.js --no-write-env    deploy + verify, but never write any file.
 *
 * Safety properties:
 *   - The verifier address must be a valid address holding contract bytecode AND must answer verifyProof().
 *   - After deployment: bytecode, verifier() === supplied address, admin === deployer, deployer authorized issuer.
 *   - If any post-deployment check fails: report it, exit non-zero, write NOTHING.
 *   - The frontend ABI/address file is never modified — the script prints the new address instead.
 *   - Only the CERT_REGISTRY_ADDRESS line of .env is ever touched; all other lines are preserved byte-for-byte.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const solc       = require('solc');
const fs         = require('fs');
const path       = require('path');

const BACKEND_DIR   = path.resolve(__dirname, '..');
const CONTRACTS_DIR = path.join(BACKEND_DIR, 'contracts');
const ARTIFACTS_DIR = path.join(BACKEND_DIR, 'artifacts', 'zk');
const ENV_PATH      = path.join(BACKEND_DIR, '.env');

const DEFAULT_EXPECTED_CHAIN_ID = 1337n;
const DEFAULT_MIN_BALANCE_ETH   = '0.1';
const RPC_TIMEOUT_MS            = 10000;

class DeployError extends Error {}
const fail = (message) => { throw new DeployError(message); };
let activeProvider = null; // released on exit so an unreachable RPC cannot keep the process alive

// ── Helpers ────────────────────────────────────────────────────────────────

function compileSolidity(fileName, source) {
    console.log(`Compiling ${fileName}…`);
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
        const errors = output.errors.filter((e) => e.severity === 'error');
        if (errors.length) fail(`Compilation failed:\n${errors.map((e) => e.formattedMessage).join('\n')}`);
    }
    const contractName = fileName.replace('.sol', '');
    const compiled = output.contracts[fileName][contractName];
    return { abi: compiled.abi, bytecode: '0x' + compiled.evm.bytecode.object };
}

/**
 * Replace (or append) a single KEY=value line in an env file.
 * Every other line and the file's line-ending style are preserved byte-for-byte.
 * Writes only when the content actually changes. Returns true if the file was modified.
 */
function updateEnvVar(envPath, key, value) {
    const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.length ? raw.split(/\r?\n/) : [];
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) {
        if (lines[idx] === `${key}=${value}`) return false;
        lines[idx] = `${key}=${value}`;
    } else {
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        lines.push(`${key}=${value}`, '');
    }
    fs.writeFileSync(envPath, lines.join(eol), 'utf8');
    return true;
}

/** Wrap a promise with a timeout so an unreachable RPC fails fast instead of hanging. */
function withTimeout(promise, ms, what) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new DeployError(`${what} timed out after ${ms}ms`)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The verifier address must be a real Groth16 verifier: valid address, contract bytecode, and it must
 * answer verifyProof() with a boolean (a code-less address — e.g. an EOA — or an unrelated contract fails).
 * Uses public curve-generator points; read-only eth_call.
 */
async function assertUsableVerifier(provider, verifierAddress, deployerAddress) {
    if (!ethers.isAddress(verifierAddress)) fail('GROTH16_VERIFIER_ADDRESS is not a valid address.');
    const verifier = ethers.getAddress(verifierAddress);
    if (verifier === ethers.ZeroAddress) fail('GROTH16_VERIFIER_ADDRESS is the zero address.');
    if (verifier === deployerAddress) fail('GROTH16_VERIFIER_ADDRESS equals the deployer wallet address (an account, not a contract).');

    const code = await provider.getCode(verifier);
    if (code === '0x') fail(`No contract bytecode at GROTH16_VERIFIER_ADDRESS ${verifier}. Deploy the Groth16Verifier first; refusing to deploy a registry that points at nothing.`);

    const probe = new ethers.Contract(verifier, [
        'function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] _pubSignals) view returns (bool)'
    ], provider);
    const G1 = [1n, 2n];
    const G2 = [
        [10857046999023057135944570762232829481370756359578518086990519993285655852781n, 11559732032986387107991004021392285783925812861821192530917403151452391805634n],
        [8495653923123431417604973247489272438418190587263600148770280649306958101930n, 4082367875863433681332203403080096598210836838686601099168236846130586118845n],
    ];
    let answer;
    try {
        answer = await probe.verifyProof(G1, G2, G1, [1n, 2n, 3n]);
    } catch (err) {
        fail(`The contract at ${verifier} did not answer verifyProof() — it does not look like a Groth16Verifier (${err.code || 'call failed'}).`);
    }
    if (typeof answer !== 'boolean') fail(`The contract at ${verifier} returned a non-boolean from verifyProof().`);
    return { verifier, codeBytes: (code.length - 2) / 2 };
}

/**
 * Post-deployment verification. Returns an array of failure strings (empty = everything passed).
 * Read-only: sends no transactions.
 */
async function verifyDeployment({ provider, registry, registryAddress, suppliedVerifier, deployerAddress }) {
    const failures = [];
    const record = [];
    const check = (name, ok, detail = '') => { record.push({ name, ok, detail }); if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

    let code = '0x';
    try { code = await provider.getCode(registryAddress); } catch (e) { /* recorded below */ }
    check('new registry has bytecode', code !== '0x');

    try {
        const onChainVerifier = await registry.verifier();
        check('registry.verifier() === supplied verifier', ethers.getAddress(onChainVerifier) === ethers.getAddress(suppliedVerifier), `on-chain ${onChainVerifier}, supplied ${suppliedVerifier}`);
    } catch (e) { check('registry.verifier() readable', false, e.code || 'call failed'); }

    try {
        const admin = await registry.admin();
        check('deployer is registry admin', ethers.getAddress(admin) === ethers.getAddress(deployerAddress), `admin ${admin}`);
    } catch (e) { check('registry.admin() readable', false, e.code || 'call failed'); }

    try {
        // The constructor authorizes msg.sender as an issuer; nothing else is added by this script.
        check('deployer is an authorized issuer', (await registry.authorizedIssuers(deployerAddress)) === true);
    } catch (e) { check('registry.authorizedIssuers() readable', false, e.code || 'call failed'); }

    return { failures, record };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(argv = process.argv.slice(2)) {
    const CHECK_ONLY = argv.includes('--check');
    const WRITE_CONFIG = !argv.includes('--no-write-env');

    // 1. Required configuration — no fallbacks, no network calls, no file writes before this passes.
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL;
    const suppliedVerifier = process.env.GROTH16_VERIFIER_ADDRESS;
    if (!privateKey) fail('PRIVATE_KEY is not set. Set it in backend/.env or the environment. Nothing was deployed or written.');
    if (!rpcUrl) fail('RPC_URL is not set. Set it in backend/.env or the environment (no default network is assumed). Nothing was deployed or written.');
    if (!suppliedVerifier) fail('GROTH16_VERIFIER_ADDRESS is not set. Deploy the Groth16Verifier first and configure its address. Nothing was deployed or written.');

    let expectedChainId;
    try { expectedChainId = process.env.EXPECTED_CHAIN_ID ? BigInt(process.env.EXPECTED_CHAIN_ID) : DEFAULT_EXPECTED_CHAIN_ID; }
    catch { fail('EXPECTED_CHAIN_ID must be an integer.'); }
    let minBalance;
    try { minBalance = ethers.parseEther(process.env.MIN_DEPLOYER_BALANCE_ETH || DEFAULT_MIN_BALANCE_ETH); }
    catch { fail('MIN_DEPLOYER_BALANCE_ETH must be a decimal number.'); }

    // 2. Deployer wallet (the key is never echoed, even on error).
    let wallet;
    try { wallet = new ethers.Wallet(privateKey); }
    catch { fail('PRIVATE_KEY is not a valid private key.'); }

    // 3. RPC reachability + chain.
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
    activeProvider = provider;
    const network = await withTimeout(provider.getNetwork(), RPC_TIMEOUT_MS, 'RPC connection').catch((e) => {
        if (e instanceof DeployError) throw e;
        fail(`RPC at RPC_URL is not reachable (${e.code || e.message}).`);
    });
    console.log(`RPC reachable | chain ID: ${network.chainId}`);
    if (network.chainId !== expectedChainId) fail(`Chain ID is ${network.chainId} but ${expectedChainId} is expected (set EXPECTED_CHAIN_ID only if intentional). Refusing to deploy.`);
    const signer = wallet.connect(provider);
    console.log(`Deployer: ${signer.address}`);

    // 4. Verifier must be a real, contract-bearing Groth16 verifier — BEFORE anything is deployed.
    const { verifier, codeBytes } = await assertUsableVerifier(provider, suppliedVerifier, signer.address);
    console.log(`Verifier ${verifier}: contract bytecode present (${codeBytes} bytes), verifyProof() answers.`);

    // 5. Deployer balance.
    const balance = await provider.getBalance(signer.address);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);
    if (balance < minBalance) fail(`Deployer balance is below the required minimum of ${ethers.formatEther(minBalance)} ETH.`);

    // 6. Compile + constructor sanity + gas estimate (read-only).
    const registrySource = fs.readFileSync(path.join(CONTRACTS_DIR, 'CertificateRegistry.sol'), 'utf8');
    const { abi: registryAbi, bytecode: registryBytecode } = compileSolidity('CertificateRegistry.sol', registrySource);
    const ctor = registryAbi.find((x) => x.type === 'constructor');
    if (!ctor || ctor.inputs.length !== 1 || ctor.inputs[0].type !== 'address') fail('Unexpected CertificateRegistry constructor signature (expected constructor(address _verifier)).');
    const registryFactory = new ethers.ContractFactory(registryAbi, registryBytecode, signer);
    const deployTx = await registryFactory.getDeployTransaction(verifier);
    const gas = await provider.estimateGas({ ...deployTx, from: signer.address });
    console.log(`Estimated deployment gas: ${gas}`);

    if (CHECK_ONLY) {
        console.log('\nCHECK ONLY: all pre-flight checks passed. No transaction was sent and no file was written.');
        return;
    }

    // 7. Deploy.
    console.log(`\nDeploying CertificateRegistry with verifier ${verifier}…`);
    const registryContract = await registryFactory.deploy(verifier);
    await registryContract.waitForDeployment();
    const registryAddress = await registryContract.getAddress();
    const deploymentTx = registryContract.deploymentTransaction();
    const receipt = await provider.getTransactionReceipt(deploymentTx.hash);
    console.log(`CertificateRegistry deployed → ${registryAddress}`);
    console.log(`Deployment TX: ${deploymentTx.hash} (block ${receipt.blockNumber}, status ${receipt.status})`);

    // 8. Post-deployment verification. Nothing is written unless EVERYTHING passes.
    const { failures, record } = await verifyDeployment({ provider, registry: registryContract, registryAddress, suppliedVerifier: verifier, deployerAddress: signer.address });
    console.log('\nPost-deployment verification:');
    for (const r of record) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : (r.detail ? ' — ' + r.detail : '')}`);
    if (receipt.status !== 1) failures.push('deployment transaction status is not 1');
    if (failures.length) {
        console.error(`\nDEPLOYMENT VERIFICATION FAILED (${failures.length}). The contract exists at ${registryAddress} but NOTHING was written:`);
        console.error('  .env, the backend ABI artifact and the frontend files are unchanged. Do not use this address.');
        failures.forEach((f) => console.error(`  - ${f}`));
        process.exitCode = 1;
        return;
    }

    // 9. Configuration writes — only after a successful deployment AND all checks above.
    if (WRITE_CONFIG) {
        const abiPath = path.join(ARTIFACTS_DIR, 'CertificateRegistry.abi.json');
        const abiJson = JSON.stringify(registryAbi, null, 2);
        if (!fs.existsSync(abiPath) || fs.readFileSync(abiPath, 'utf8') !== abiJson) {
            fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
            fs.writeFileSync(abiPath, abiJson);
            console.log('\nBackend ABI artifact updated (artifacts/zk/CertificateRegistry.abi.json).');
        } else {
            console.log('\nBackend ABI artifact already up to date.');
        }
        console.log(updateEnvVar(ENV_PATH, 'CERT_REGISTRY_ADDRESS', registryAddress)
            ? 'backend/.env: CERT_REGISTRY_ADDRESS updated (no other line touched). Restart the backend to use it.'
            : 'backend/.env: CERT_REGISTRY_ADDRESS already set to this address.');
    } else {
        console.log('\n--no-write-env: no file was written.');
    }

    // 10. Frontend is never modified automatically.
    console.log('\nNEXT STEPS (manual — this script does not touch frontend files):');
    console.log(`  • Set "registryAddress" to ${registryAddress} in certificate-portal/public/zk/CertificateRegistry.abi.json`);
    console.log('    if the verification page should read the new registry.');
    if (!WRITE_CONFIG) console.log(`  • Set CERT_REGISTRY_ADDRESS=${registryAddress} in backend/.env, then restart the backend.`);
}

/** Exit with `code` without calling process.exit() eagerly (it can trip a libuv assertion on Windows). */
function finish(code) {
    process.exitCode = code;
    try { if (activeProvider) activeProvider.destroy(); } catch { /* ignore */ }
    setTimeout(() => process.exit(process.exitCode), 3000).unref(); // last-resort guard if something keeps the loop alive
}

if (require.main === module) {
    main()
        .then(() => finish(process.exitCode || 0))
        .catch((err) => {
            // DeployError messages are ours and safe to print; anything else is reduced to a short code.
            console.error(err instanceof DeployError ? `ABORT: ${err.message}` : `ERROR: ${err.shortMessage || err.code || 'unexpected failure'}`);
            finish(1);
        });
}

module.exports = { main, updateEnvVar, assertUsableVerifier, verifyDeployment, withTimeout, DeployError };
