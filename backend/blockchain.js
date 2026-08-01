const { ethers } = require("ethers");
require("dotenv").config();

// Provider pointing to JSON-RPC node (e.g. local Ganache on http://127.0.0.1:7545)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:7545");

// Wallet that signs & pays gas for on-chain anchoring
const wallet = new ethers.Wallet(
    process.env.PRIVATE_KEY || "0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388",
    provider
);

// Smart contract address
const contractAddress = process.env.CONTRACT_ADDRESS || "0x4cB06b7850239d5CcDCA04FddEc75772A5a573Ec";

// Complete Smart Contract ABI for EMRRegistry.sol
const abi = [
    // Legacy Constructor & Events
    "constructor()",
    "event HashAnchored(string batchHash, uint256 timestamp)",
    "event RecordAnchored(string indexed patientId, string recordType, string dataHash, string ipfsCid, uint256 timestamp, address indexed recordOwner)",

    // Legacy Functions (Preserved 100%)
    "function storeHash(string memory _batchHash) public",
    "function getAnchor(uint256 index) public view returns (string memory, uint256)",
    "function getTotalAnchors() public view returns (uint256)",
    "function owner() public view returns (address)",

    // Extended EMR Anchoring Functions
    "function storeEMRRecord(string memory _patientId, string memory _recordType, string memory _dataHash, string memory _ipfsCid) public",
    "function getEMRRecord(uint256 index) public view returns (string memory patientId, string memory recordType, string memory dataHash, uint256 timestamp, string memory ipfsCid, address recordOwner)",
    "function getTotalEMRRecords() public view returns (uint256)",
    "function getPatientRecordIndices(string memory _patientId) public view returns (uint256[] memory)",
    "function verifyRecordHash(string memory _dataHash) public view returns (bool exists, uint256 timestamp, string memory patientId, string memory recordType, string memory ipfsCid, address recordOwner)"
];

const contract = new ethers.Contract(contractAddress, abi, wallet);

module.exports = contract;
