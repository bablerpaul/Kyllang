#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

async function compileContract(contractName) {
    console.log(`Compiling ${contractName}.sol...`);
    const contractPath = path.resolve(__dirname, `../contracts/${contractName}.sol`);
    
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Contract artifact missing: ${contractPath}`);
    }
    
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            [`${contractName}.sol`]: {
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

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasError = true;
        });
        if (hasError) throw new Error(`Compilation failed for ${contractName}.sol`);
    }

    const contract = output.contracts[`${contractName}.sol`][contractName];
    return {
        abi: contract.abi,
        bytecode: contract.evm.bytecode.object
    };
}

async function main() {
    console.log("Starting Core Registries Deployment...\n");

    // 1 & 2. Load and validate configuration
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
        throw new Error("RPC_URL missing from environment variables. Do not rely on defaults.");
    }

    // 3. Validate deployment credential
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY missing from environment variables. Wallet credential is required.");
    }

    // 4. Connect to RPC
    console.log(`Connecting to RPC: ${rpcUrl}`);
    let provider;
    let network;
    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        network = await provider.getNetwork();
    } catch (err) {
        throw new Error(`RPC unreachable: ${err.message}`);
    }

    // 5. Display chain ID
    console.log(`Connected successfully.`);
    console.log(`Network Name: ${network.name}`);
    console.log(`Chain ID: ${network.chainId}\n`);

    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Deploying with wallet: ${wallet.address}`);
    const initialNonce = await provider.getTransactionCount(wallet.address);
    let currentNonce = initialNonce;

    const contractsToDeploy = ['EMRRegistry', 'ConsentRegistry', 'EmergencyEscrow'];
    const results = {};

    for (const contractName of contractsToDeploy) {
        const { abi, bytecode } = await compileContract(contractName);
        
        console.log(`\nDeploying ${contractName}...`);
        const factory = new ethers.ContractFactory(abi, bytecode, wallet);
        
        const contract = await factory.deploy({ nonce: currentNonce++ });
        const txHash = contract.deploymentTransaction().hash;
        console.log(`Transaction Hash: ${txHash}`);
        console.log(`Waiting for deployment confirmation...`);
        
        await contract.waitForDeployment();
        const address = await contract.getAddress();
        console.log(`${contractName} deployed to: ${address}`);
        
        results[contractName] = {
            address,
            txHash
        };
    }

    console.log("\n==================================================");
    console.log("DEPLOYMENT SUMMARY");
    console.log("==================================================");
    console.log(`NETWORK / CHAIN ID: ${network.chainId} (${network.name})`);

    for (const contractName of contractsToDeploy) {
        console.log(`\n${contractName}`);
        console.log(`Address: ${results[contractName].address}`);
        console.log(`Deployment TX: ${results[contractName].txHash}`);
    }

    console.log("\n==================================================");
    console.log("Deployment complete. NOTE: Contract addresses were NOT automatically written to .env");
}

main().catch(err => {
    console.error("\n[ERROR] Deployment failed safely:");
    console.error(err.message);
    process.exit(1);
});
