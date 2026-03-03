const { ethers } = require("ethers");

// connect ganache
const provider = new ethers.JsonRpcProvider("HTTP://127.0.0.1:7545");

// paste ganache private key
const signer = new ethers.Wallet("0xca61d3d447a0a276f6e463cad3a5d3f1cd29063006e027da37bc94e189441a67", provider);

// paste from remix
const contractAddress = "0xFBF817CB2727845D82C5385d39e6B1272680bC6c";

// paste ABI from remix
const abi = [
    "function storeHash(string memory _hash) public"
];

const contract = new ethers.Contract(contractAddress, abi, signer);

// function to store hash
async function saveHash(hashValue) {
    const tx = await contract.storeHash(hashValue);
    await tx.wait();
    console.log("Hash stored:", hashValue);
}

module.exports = saveHash;
