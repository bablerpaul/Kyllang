const { ethers } = require('ethers');

async function testConnection() {
    console.log("Testing Ganache Connection...");
    try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
        
        // Test 1: Connect & Get Network
        const network = await provider.getNetwork();
        console.log(`Connected to Network: ${network.name} (Chain ID: ${network.chainId})`);
        
        // Test 2: Check Contracts
        const addresses = {
            "EMRRegistry": "0x77d5F4816532151BD2a2eB00e56321B2E02Eee5f",
            "ConsentRegistry": "0x56E2c87e2599b85CE06cb0Afd4145ba6238B4f58",
            "CertRegistry": "0x1FAE9D59468a4aa260432655DB2a9E8d8346F159"
        };
        
        for (const [name, addr] of Object.entries(addresses)) {
            const code = await provider.getCode(addr);
            if (code === "0x") {
                console.log(`FAIL: ${name} at ${addr} has NO code (Not deployed to this Ganache instance)`);
            } else {
                console.log(`PASS: ${name} at ${addr} is deployed.`);
            }
        }
        
    } catch (err) {
        console.error("GANACHE CONNECTION FAILED:");
        console.error(err.message);
    }
}

testConnection();
