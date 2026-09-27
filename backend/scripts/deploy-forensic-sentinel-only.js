require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

async function compileContract(contractName, sourcePath) {
    const source = fs.readFileSync(sourcePath, 'utf8');

    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const cleanPath = importPath.replace('@4.9.3', '');
            const resolvedPath = path.resolve(__dirname, '../node_modules', cleanPath);
            return { contents: fs.readFileSync(resolvedPath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const input = {
        language: 'Solidity',
        sources: {
            [contractName + '.sol']: { content: source }
        },
        settings: {
            evmVersion: 'paris',
            outputSelection: {
                '*': { '*': ['*'] }
            }
        }
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
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error("RPC_URL missing");
    const adminKey = process.env.PRIVATE_KEY;
    if (!adminKey) throw new Error("PRIVATE_KEY missing");

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    if (network.chainId.toString() !== '1337') {
        throw new Error("Chain ID is not 1337");
    }

    const wallet = new ethers.Wallet(adminKey, provider);
    if (wallet.address.toLowerCase() !== '0xb10238a2DE2Df63C986735b500a3d1DE4079e670'.toLowerCase()) {
        throw new Error("Wallet address mismatch");
    }

    const bgAddress = process.env.BREAK_GLASS_REGISTRY_ADDRESS;
    if (!bgAddress) throw new Error("BREAK_GLASS_REGISTRY_ADDRESS missing in .env");

    const bgCode = await provider.getCode(bgAddress);
    if (bgCode === '0x' || bgCode === '') {
        throw new Error("No bytecode found at BREAK_GLASS_REGISTRY_ADDRESS");
    }

    const sentinelPath = path.resolve(__dirname, '../contracts/ForensicSentinelRegistry.sol');
    const sentinelArtifact = await compileContract('ForensicSentinelRegistry', sentinelPath);

    console.log("Deploying ForensicSentinelRegistry...");
    const sentinelWallet = ethers.Wallet.createRandom();
    const TIMEOUT_BLOCKS = 100;
    
    const sentinelFactory = new ethers.ContractFactory(sentinelArtifact.abi, sentinelArtifact.evm.bytecode.object, wallet);
    const sentinelRegistry = await sentinelFactory.deploy(sentinelWallet.address, TIMEOUT_BLOCKS);
    await sentinelRegistry.waitForDeployment();
    
    const sentinelAddress = await sentinelRegistry.getAddress();
    console.log(`ForensicSentinelRegistry deployed to: ${sentinelAddress}`);
    
    const code = await provider.getCode(sentinelAddress);
    if (code === '0x' || code === '') {
        throw new Error("No bytecode found at newly deployed Sentinel address");
    }
}

if (require.main === module) {
    main().catch(console.error);
}
