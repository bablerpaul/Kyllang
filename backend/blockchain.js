const { ethers } = require("ethers");
require("dotenv").config();

if (process.env.TEST_MODE === 'true') {
    module.exports = {
        storeEMRRecord: async () => ({ wait: async () => {}, hash: `mock_tx_${Date.now()}` }),
        verifyRecordHash: async (hash) => {
             if (hash === 'corrupted_hash' || String(hash).includes('corrupted')) return [false];
             return [true, Date.now(), 'mock_patient', 'mock_type', 'mock_cid', '0x123'];
        },
        getContract: (name) => {
             return {
                 getSession: async () => ({ active: true, expiresAt: Date.now() / 1000 + 3600 }),
                 isNullifierConsumed: async () => false,
                 consumeNullifier: async () => ({ wait: async () => {} })
             };
        }
    };
} else {
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

    // KYLLANG_V4: Support for multiple contracts
    const zkVerifierAbi = [
        "function isNullifierConsumed(bytes32 nullifier) external view returns (bool)",
        "function consumeNullifier(bytes32 nullifier) external",
        "function setSriHash(string calldata artifactName, string calldata sriHash) external"
    ];
    
    const emergencyEscrowAbi = [
        "function getSession(bytes32 vrfLookupToken, address requestingDoctorAddress) external view returns (bool active, uint256 expiresAt)",
        "function openSession(bytes32 vrfLookupToken, address doctorAddress, uint256 durationSeconds) external",
        "function closeSession(bytes32 vrfLookupToken) external",
        "function setMCI(bool _active) external"
    ];

    const contracts = {
        'EMRRegistry': contract,
        'ZKVerifier': new ethers.Contract(process.env.ZK_VERIFIER_ADDRESS || ethers.ZeroAddress, zkVerifierAbi, wallet),
        'EmergencyEscrow': new ethers.Contract(process.env.EMERGENCY_ESCROW_ADDRESS || ethers.ZeroAddress, emergencyEscrowAbi, wallet)
    };

    // Attach getContract to the EMRRegistry contract instance to maintain backward compatibility
    // for existing code that does: const contract = require('./blockchain'); contract.storeEMRRecord(...)
    contract.getContract = function(name) {
        return contracts[name] || null;
    };

    module.exports = contract;
}
