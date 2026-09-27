const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error("RPC_URL missing");
    const adminKey = process.env.PRIVATE_KEY;
    if (!adminKey) throw new Error("PRIVATE_KEY missing");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(adminKey, provider);
    const adminAddress = await signer.getAddress();

    console.log(`[Deploy] Deploying EmergencyAuditRegistry with admin: ${adminAddress}`);

    const contractPath = path.join(__dirname, '../contracts/EmergencyAuditRegistry.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    // Need solc to compile. Since we use OpenZeppelin, we need standard-json input.
    const solc = require('solc');
    
    // Resolve OZ imports
    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const cleanPath = importPath.replace('@4.9.3', '');
            const ozPath = path.join(__dirname, '../node_modules', cleanPath);
            return { contents: fs.readFileSync(ozPath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const input = {
        language: 'Solidity',
        sources: { 'EmergencyAuditRegistry.sol': { content: source } },
        settings: { 
            evmVersion: 'paris',
            outputSelection: { '*': { '*': ['*'] } } 
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    
    if (output.errors) {
        let hasErrors = false;
        output.errors.forEach(err => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasErrors = true;
        });
        if (hasErrors) process.exit(1);
    }

    const contractDef = output.contracts['EmergencyAuditRegistry.sol']['EmergencyAuditRegistry'];
    const factory = new ethers.ContractFactory(contractDef.abi, contractDef.evm.bytecode.object, signer);
    
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    
    const address = await registry.getAddress();
    console.log(`[Deploy] ✅ EmergencyAuditRegistry deployed to: ${address}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;
