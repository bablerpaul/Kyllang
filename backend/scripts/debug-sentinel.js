const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compileContract(contractName, sourcePath) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin/')) {
            const resolvedPath = path.resolve(__dirname, '../node_modules', importPath);
            return { contents: fs.readFileSync(resolvedPath, 'utf8') };
        }
        return { error: 'File not found' };
    }
    const input = {
        language: 'Solidity',
        sources: { [contractName + '.sol']: { content: source } },
        settings: { outputSelection: { '*': { '*': ['*'] } } }
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    return output.contracts[contractName + '.sol'][contractName];
}

async function run() {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const adminKey = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d'; 
    const signer1Key = '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1';
    
    const admin = new ethers.Wallet(adminKey, provider);
    const signer1 = new ethers.Wallet(signer1Key, provider);
    
    const sentinelArtifact = await compileContract('ForensicSentinelRegistry', path.resolve(__dirname, '../contracts/ForensicSentinelRegistry.sol'));
    const sentinelFactory = new ethers.ContractFactory(sentinelArtifact.abi, sentinelArtifact.evm.bytecode.object, admin);
    const sentinelRegistry = await sentinelFactory.deploy(admin.address, 100);
    await sentinelRegistry.waitForDeployment();
    console.log("Deployed to:", await sentinelRegistry.getAddress());
    
    await (await sentinelRegistry.setAuthorizedSigner(signer1.address, true)).wait();
    await (await sentinelRegistry.setAuthorizedSigner(admin.address, true)).wait();
    
    const chainId = (await provider.getNetwork()).chainId;
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("hello"));
    const newSequence = 1n;
    
    const msgHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256', 'address'],
        [newRoot, newSequence, chainId, await sentinelRegistry.getAddress()]
    );
    
    const sig1 = await signer1.signMessage(ethers.getBytes(msgHash));
    const sig2 = await admin.signMessage(ethers.getBytes(msgHash));
    
    let signatures = [sig1, sig2];
    if (BigInt(signer1.address) > BigInt(admin.address)) {
        signatures = [sig2, sig1];
    }
    
    try {
        const tx = await sentinelRegistry.updateApprovedRoot(newRoot, newSequence, signatures);
        await tx.wait();
        console.log("Success!");
    } catch (e) {
        console.log("Error:", e);
    }
}
run();
