const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

async function compileContract(contractName, sourcePath) {
    const source = fs.readFileSync(sourcePath, 'utf8');

    // ForensicSentinelRegistry imports @openzeppelin/contracts. 
    // We need a custom import callback for solc.
    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const resolvedPath = path.resolve(__dirname, '../node_modules', importPath);
            return { contents: fs.readFileSync(resolvedPath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const input = {
        language: 'Solidity',
        sources: {
            [contractName + '.sol']: {
                content: source,
            },
        },
        settings: {
            evmVersion: 'paris',
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
    };

    console.log(`Compiling ${contractName}.sol...`);
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => {
            if (err.severity === 'error') {
                console.error(err.formattedMessage);
                hasError = true;
            }
        });
        if (hasError) throw new Error("Compilation failed");
    }

    return output.contracts[contractName + '.sol'][contractName];
}

async function main() {
    console.log("Starting BreakGlass & Forensic Sentinel Deployment...");

    const sentinelPath = path.resolve(__dirname, '../contracts/ForensicSentinelRegistry.sol');
    const breakGlassPath = path.resolve(__dirname, '../contracts/BreakGlassRegistry.sol');

    const sentinelArtifact = await compileContract('ForensicSentinelRegistry', sentinelPath);
    const breakGlassArtifact = await compileContract('BreakGlassRegistry', breakGlassPath);

    // Connect to Ganache
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const adminKey = process.env.PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    const wallet = new ethers.Wallet(adminKey, provider);
    console.log("Deploying with account:", wallet.address);

    let nonce = await provider.getTransactionCount(wallet.address);

    // 1. Deploy BreakGlassRegistry
    console.log("Deploying BreakGlassRegistry...");
    const bgFactory = new ethers.ContractFactory(breakGlassArtifact.abi, breakGlassArtifact.evm.bytecode.object, wallet);
    const bgRegistry = await bgFactory.deploy({ nonce: nonce++ });
    await bgRegistry.waitForDeployment();
    const bgAddress = await bgRegistry.getAddress();
    console.log(`BreakGlassRegistry deployed to: ${bgAddress}`);

    // 2. Deploy ForensicSentinelRegistry
    // Assume the sentinel address is a dedicated wallet. For now, we'll use a random wallet or the same admin for testing.
    const sentinelWallet = ethers.Wallet.createRandom();
    const TIMEOUT_BLOCKS = 100;
    
    console.log(`Deploying ForensicSentinelRegistry (Sentinel: ${sentinelWallet.address}, Timeout: ${TIMEOUT_BLOCKS} blocks)...`);
    const sentinelFactory = new ethers.ContractFactory(sentinelArtifact.abi, sentinelArtifact.evm.bytecode.object, wallet);
    const sentinelRegistry = await sentinelFactory.deploy(sentinelWallet.address, TIMEOUT_BLOCKS, { nonce: nonce++ });
    await sentinelRegistry.waitForDeployment();
    const sentinelAddress = await sentinelRegistry.getAddress();
    console.log(`ForensicSentinelRegistry deployed to: ${sentinelAddress}`);

    // 3. Link them together
    console.log("Linking BreakGlass to ForensicSentinel...");
    const linkTx = await bgRegistry.setForensicSentinelRegistry(sentinelAddress, { nonce: nonce++ });
    await linkTx.wait();
    console.log("Linking complete.");

    // Update .env
    const envPath = path.resolve(__dirname, '../.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const updateEnv = (key, value) => {
        if (envContent.includes(`${key}=`)) {
            const regex = new RegExp(`${key}=.*`);
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            envContent += `\n${key}=${value}\n`;
        }
    };

    updateEnv('BREAK_GLASS_REGISTRY_ADDRESS', bgAddress);
    updateEnv('FORENSIC_SENTINEL_ADDRESS', sentinelAddress);
    updateEnv('SENTINEL_PRIVATE_KEY', sentinelWallet.privateKey);
    
    fs.writeFileSync(envPath, envContent);
    console.log(".env updated.");
}

main().catch(err => {
    console.error("Deployment error:", err);
    process.exit(1);
});
