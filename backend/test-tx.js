const saveHash = require('./app');

async function checkTx() {
    console.log("Saving a test hash to Ganache...");
    const testDataHash = "0x" + "1234".repeat(16); // 64 char string

    require("dotenv").config();
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "HTTP://127.0.0.1:7545");
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY || "0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388", provider);
    const contractAddress = process.env.CONTRACT_ADDRESS || "0x4cB06b7850239d5CcDCA04FddEc75772A5a573Ec";
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
