const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

async function main() {
    console.log("Starting KeyEscrowRegistry deployment...");

    const contractPath = path.resolve(__dirname, '../contracts/KeyEscrowRegistry.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'KeyEscrowRegistry.sol': {
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

    console.log("Compiling KeyEscrowRegistry.sol...");
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasError = true;
        });
        if (hasError) throw new Error("Compilation failed");
    }

    const contract = output.contracts['KeyEscrowRegistry.sol']['KeyEscrowRegistry'];
    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;

    // Connect to Ganache
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // We can use the first Ganache account or a known private key
    // Using a known one for consistency, or letting Ganache provide a signer
    const adminKey = process.env.PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    const wallet = new ethers.Wallet(adminKey, provider);
    console.log("Deploying with account:", wallet.address);

    const nonce = await provider.getTransactionCount(wallet.address);
    console.log(`Current nonce: ${nonce}`);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const registry = await factory.deploy({ nonce });
    
    console.log("Waiting for deployment transaction...");
    await registry.waitForDeployment();
    
    const address = await registry.getAddress();
    console.log(`KeyEscrowRegistry deployed to: ${address}`);

    // Update the .env file with the new address
    const envPath = path.resolve(__dirname, '../.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    if (envContent.includes('KEY_ESCROW_REGISTRY_ADDRESS=')) {
        envContent = envContent.replace(/KEY_ESCROW_REGISTRY_ADDRESS=.*/, `KEY_ESCROW_REGISTRY_ADDRESS=${address}`);
    } else {
        envContent += `\nKEY_ESCROW_REGISTRY_ADDRESS=${address}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(".env updated with KEY_ESCROW_REGISTRY_ADDRESS");
}

main().catch(err => {
    console.error("Deployment error:", err);
    process.exit(1);
});
