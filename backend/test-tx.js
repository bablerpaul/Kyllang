const saveHash = require('./app');

async function checkTx() {
    console.log("Saving a test hash to Ganache...");
    const testDataHash = "0x" + "1234".repeat(16); // 64 char string

    // We modify app.js slightly just for this test to print the TX hash
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider("HTTP://127.0.0.1:7545");
    const signer = new ethers.Wallet("0xca61d3d447a0a276f6e463cad3a5d3f1cd29063006e027da37bc94e189441a67", provider);
    const contractAddress = "0xFBF817CB2727845D82C5385d39e6B1272680bC6c";
    const abi = ["function storeHash(string memory _hash) public"];
    const contract = new ethers.Contract(contractAddress, abi, signer);

    try {
        const tx = await contract.storeHash(testDataHash);
        console.log("--------------------------------------------------");
        console.log("1. TRANSACTION HASH (This is what you see in Ganache UI under 'TX HASH'):");
        console.log("   " + tx.hash);
        console.log("");

        const receipt = await tx.wait();

        console.log("2. DATA HASH (This is the actual data we saved inside the contract):");
        console.log("   " + testDataHash);
        console.log("--------------------------------------------------");
        console.log("\nIf you look in Ganache right now, the very top row in the Transactions tab should have the TX HASH printed above.");
    } catch (e) {
        console.log("Error:", e.message);
    }
}

checkTx();
