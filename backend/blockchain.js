/**
 * blockchain.js — Kyllang Blockchain Contract Registry
 *
 * Manages ethers.js provider, wallet, and all smart contract instances.
 * In TEST_MODE=true, all calls return mocked responses for unit testing.
 *
 * Contracts managed:
 *   EMRRegistry        — Legacy EMR record anchoring (preserved)
 *   CertificateRegistry — ZK certificate commitment registry + Groth16 verifier wrapper
 *   EmergencyEscrow    — Emergency access session management
 */

const { ethers } = require('ethers');
const path = require('path');
const fs   = require('fs');
require('dotenv').config();

// ── Test Mode Mock ─────────────────────────────────────────────────────────
if (process.env.TEST_MODE === 'true') {
    module.exports = {
        commitHash: async () => ({ wait: async () => {}, hash: `mock_commit_tx_${Date.now()}` }),
        revealHash: async () => ({ wait: async () => {}, hash: `mock_reveal_tx_${Date.now()}` }),
        verifyRecordHash: async (hash) => {
            if (hash === 'corrupted_hash' || String(hash).includes('corrupted')) return [false];
            return [true, Date.now(), 'mock_patient', 'mock_type', 'mock_cid', '0x123'];
        },
        getContract: (name) => {
            if (name === 'CertificateRegistry') {
                return {
                    registerCertificate:      async () => ({ wait: async () => ({}) }),
                    revokeCertificate:        async () => ({ wait: async () => ({}) }),
                    verifyCertificateProof:   async () => ({ wait: async () => ({ hash: 'mock_tx' }), hash: 'mock_verify_tx' }),
                    verifyCertificateProofStatic: async () => ([true, true, false, false, '0xMockIssuer', BigInt(Date.now())]),
                    authorizedIssuers:        async () => true,
                    getCertificateRecord:     async () => ['0xMockIssuer', BigInt(Date.now()), false, true],
                    isSessionConsumed:        async () => false,
                };
            }
            if (name === 'EmergencyEscrow') {
                return {
                    getSession:  async () => ({ active: true, expiresAt: Date.now() / 1000 + 3600 }),
                    openSession: async () => ({ wait: async () => {} }),
                    closeSession:async () => ({ wait: async () => {} }),
                    setMCI:      async () => ({ wait: async () => {} }),
                };
            }
            return null;
        },
    };
} else {
    // ── Live Mode ──────────────────────────────────────────────────────────

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:7545');
    const wallet   = new ethers.Wallet(
        process.env.PRIVATE_KEY || '0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388',
        provider
    );

    // ── EMRRegistry (legacy — preserved) ──────────────────────────────────
    const emrAbi = [
        'constructor()',
        'event HashAnchored(string batchHash, uint256 timestamp)',
        'event RecordAnchored(string indexed patientId, string recordType, string dataHash, string ipfsCid, uint256 timestamp, address indexed recordOwner)',
        'function commitHash(bytes32 commitment) external',
        'function revealHash(string memory _patientId, string memory _recordType, string memory _dataHash, string memory _ipfsCid, bytes32 nonce) external',
        'function getEMRRecord(uint256 index) public view returns (string memory patientId, string memory recordType, string memory dataHash, uint256 timestamp, string memory ipfsCid, address recordOwner)',
        'function getTotalEMRRecords() public view returns (uint256)',
        'function getPatientRecordIndices(string memory _patientId) public view returns (uint256[] memory)',
        'function verifyRecordHash(string memory _dataHash) public view returns (bool exists, uint256 timestamp, string memory patientId, string memory recordType, string memory ipfsCid, address recordOwner)',
        'function getAnchor(uint256 index) public view returns (string memory, uint256)',
        'function getTotalAnchors() public view returns (uint256)',
        'function owner() public view returns (address)',
    ];

    const emrContract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS || '0xDA0bab807633f07f013f94DD0E6A4F96F8742B53',
        emrAbi,
        wallet
    );

    // ── CertificateRegistry ABI ────────────────────────────────────────────
    // Load from generated artifact if available, otherwise use inline ABI
    let registryAbi;
    const abiPath = path.join(__dirname, 'artifacts', 'zk', 'CertificateRegistry.abi.json');
    if (fs.existsSync(abiPath)) {
        try {
            registryAbi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        } catch (_) { registryAbi = null; }
    }

    // Fallback inline ABI (core functions)
    if (!registryAbi) {
        registryAbi = [
            'event IssuerAdded(address indexed issuer, uint256 timestamp)',
            'event IssuerRemoved(address indexed issuer, uint256 timestamp)',
            'event CertificateRegistered(bytes32 indexed commitmentHash, address indexed issuer, uint256 timestamp)',
            'event CertificateRevoked(bytes32 indexed commitmentHash, address indexed revokedBy, uint256 timestamp)',
            'event CertificateVerified(bytes32 indexed commitmentHash, bytes32 indexed sessionCommitment, address indexed verifiedBy, uint256 blockNumber)',
            'function admin() external view returns (address)',
            'function authorizedIssuers(address) external view returns (bool)',
            'function registeredCertificates(bytes32) external view returns (address issuer, uint256 issuedAt, bool revoked, bool exists)',
            'function consumedSessions(bytes32) external view returns (uint256)',
            'function addIssuer(address issuer) external',
            'function removeIssuer(address issuer) external',
            'function transferAdmin(address newAdmin) external',
            'function registerCertificate(bytes32 commitmentHash) external',
            'function revokeCertificate(bytes32 commitmentHash) external',
            'function verifyCertificateProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] pubSignals) external returns (bool)',
            'function verifyCertificateProofStatic(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] pubSignals) external view returns (bool valid, bool certExists, bool certRevoked, bool sessionConsumed, address issuer, uint256 issuedAt)',
            'function getCertificateRecord(bytes32 commitmentHash) external view returns (address issuer, uint256 issuedAt, bool revoked, bool exists)',
            'function isSessionConsumed(bytes32 sessionCommitment) external view returns (bool)',
        ];
    }

    const registryAddress = process.env.CERT_REGISTRY_ADDRESS;
    const registryContract = registryAddress && registryAddress !== 'undefined'
        ? new ethers.Contract(registryAddress, registryAbi, wallet)
        : null;

    // ── EmergencyEscrow (preserved) ────────────────────────────────────────
    const escrowAbi = [
        'function getSession(bytes32 vrfLookupToken, address requestingDoctorAddress) external view returns (bool active, uint256 expiresAt)',
        'function openSession(bytes32 vrfLookupToken, address doctorAddress, uint256 durationSeconds) external',
        'function closeSession(bytes32 vrfLookupToken) external',
        'function setMCI(bool _active) external',
    ];
    const escrowContract = process.env.EMERGENCY_ESCROW_ADDRESS
        ? new ethers.Contract(process.env.EMERGENCY_ESCROW_ADDRESS, escrowAbi, wallet)
        : null;

    // ── Contract Registry ──────────────────────────────────────────────────
    const contracts = {
        EMRRegistry:         emrContract,
        CertificateRegistry: registryContract,
        EmergencyEscrow:     escrowContract,
    };

    // Attach getContract to the default export (backward-compat)
    emrContract.getContract = (name) => contracts[name] || null;

    module.exports = emrContract;
}
