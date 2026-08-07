require("dotenv").config();
const { ethers } = require("ethers");

// connect to ganache
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:7545");

// ganache private key
const signer = new ethers.Wallet(
    process.env.PRIVATE_KEY || "0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388",
    provider
);

// contract address from remix
const contractAddress = process.env.CONTRACT_ADDRESS || "0x4cB06b7850239d5CcDCA04FddEc75772A5a573Ec";

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
