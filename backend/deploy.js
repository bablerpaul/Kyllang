const path = require('path');
const fs = require('fs');
const solc = require('solc');
const { ethers } = require('ethers');

async function main() {
    console.log("Compiling EMRRegistry.sol...");
    const contractPath = path.resolve(__dirname, 'contracts', 'EMRRegistry.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'EMRRegistry.sol': {
                content: source
            }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*']
                }
            }
        }
    };

    const tempFile = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (tempFile.errors) {
        let hasError = false;
        for (const err of tempFile.errors) {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasError = true;
        }
        if (hasError) throw new Error("Compilation failed");
    }

    const contractFile = tempFile.contracts['EMRRegistry.sol']['EMRRegistry'];
    const bytecode = contractFile.evm.bytecode.object;
    const abi = contractFile.abi;

    console.log("Connecting to Ganache...");
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
    
    // Default private key
    let privateKey = "0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388";
    
    // Let's connect a wallet
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Deploying contract with account: ${wallet.address}`);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log(`EMRRegistry deployed to: ${contractAddress}`);

    // Update .env file
    const envPath = path.resolve(__dirname, '.env');
    const envContent = `PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/certificate-portal
JWT_SECRET=super_secret_jwt_key_medichain_2026
RPC_URL=http://127.0.0.1:7545
CONTRACT_ADDRESS=${contractAddress}
PRIVATE_KEY=${privateKey}
IPFS_NODE_URL=http://127.0.0.1:5001/api/v0/add
`;
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`.env file updated with contract address: ${contractAddress}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
