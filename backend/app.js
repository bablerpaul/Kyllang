require("dotenv").config();
const { ethers } = require("ethers");

// connect to ganache
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:7545");

// ganache private key — must be set via PRIVATE_KEY environment variable
if (!process.env.PRIVATE_KEY) {
    throw new Error('[CONFIG ERROR] PRIVATE_KEY environment variable is required but not set. Cannot initialize blockchain wallet.');
}
const signer = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    provider
);

// contract address from remix
const contractAddress = process.env.CONTRACT_ADDRESS || "0xDA0bab807633f07f013f94DD0E6A4F96F8742B53";

// ABI from remix
const abi = [
    "function storeHash(string memory _batchHash) public",
    "function getAnchor(uint256 index) public view returns (string memory,uint256)",
    "function getTotalAnchors() public view returns (uint256)"
];

const contract = new ethers.Contract(contractAddress, abi, signer);

// store hash
async function storeHash(hash) {
    const tx = await contract.storeHash(hash);
    await tx.wait();
    console.log("Hash stored:", hash);
}

module.exports = storeHash;
