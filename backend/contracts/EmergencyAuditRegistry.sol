// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title EmergencyAuditRegistry
 * @dev Immutably anchors cryptographic commitments of emergency break-glass sessions
 * while enforcing zero-knowledge privacy for the actual PHI/PII data.
 */
contract EmergencyAuditRegistry {
    using ECDSA for bytes32;

    struct AuditRecord {
        bytes32 commitmentHash;
        uint64 timestamp;
        uint64 blockNumber;
        uint64 sequenceNumber;
        address recordedBy;
    }

    uint64 public globalAuditSeq;
    address public admin;

    // sessionNonce => AuditRecord
    mapping(bytes32 => AuditRecord) public auditCommitments;
    
    // sessionNonce => hasBeenConsumed
    mapping(bytes32 => bool) public consumedNonces;
    
    // RBAC for valid signature signers
    mapping(address => bool) public isAuthorizedDoctor;
    mapping(address => bool) public isAuthorizedCustodian;
    mapping(address => bool) public isAuthorizedEnclave;

    event EmergencyAuditAnchored(bytes32 indexed sessionNonce, bytes32 indexed commitmentHash, uint64 timestamp);
    event RoleGranted(string role, address account);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setAuthorizedDoctor(address _doc, bool _status) external onlyAdmin {
        isAuthorizedDoctor[_doc] = _status;
        if (_status) emit RoleGranted("Doctor", _doc);
    }

    function setAuthorizedCustodian(address _custodian, bool _status) external onlyAdmin {
        isAuthorizedCustodian[_custodian] = _status;
        if (_status) emit RoleGranted("Custodian", _custodian);
    }

    function setAuthorizedEnclave(address _enclave, bool _status) external onlyAdmin {
        isAuthorizedEnclave[_enclave] = _status;
        if (_status) emit RoleGranted("Enclave", _enclave);
    }

    /**
     * @dev Records an emergency audit payload anchor on-chain.
     * Verifies that the ER Doctor, the Custodian, and the Enclave all signed the exact same commitment hash.
     * @param sessionNonce A unique cryptographic nonce to prevent replay attacks.
     * @param commitmentHash The keccak256 hash of the encrypted payload details (zero PHI leaked).
     * @param doctorSig ECDSA signature from the ER Doctor.
     * @param custodianSig ECDSA signature from the approving Admin Custodian.
     * @param enclaveSig ECDSA signature from the Secure Enclave confirming decryption execution.
     */
    function recordEmergencyAudit(
        bytes32 sessionNonce,
        bytes32 commitmentHash,
        bytes calldata doctorSig,
        bytes calldata custodianSig,
        bytes calldata enclaveSig
    ) external {
        // 1. Anti-Replay Defense
        require(!consumedNonces[sessionNonce], "Nonce already consumed (Replay Attack)");
        
        // The message hash that all parties must have signed
        // We use EthSignedMessageHash to conform with standard JSON-RPC signing formats
        bytes32 messageHash = keccak256(abi.encodePacked(sessionNonce, commitmentHash)).toEthSignedMessageHash();
        
        // 2. Verify Signatures
        address docSigner = messageHash.recover(doctorSig);
        require(isAuthorizedDoctor[docSigner], "Invalid or unauthorized Doctor signature");

        address custodianSigner = messageHash.recover(custodianSig);
        require(isAuthorizedCustodian[custodianSigner], "Invalid or unauthorized Custodian signature");

        address enclaveSigner = messageHash.recover(enclaveSig);
        require(isAuthorizedEnclave[enclaveSigner], "Invalid or unauthorized Enclave signature");

        // 3. Mark nonce as consumed
        consumedNonces[sessionNonce] = true;

        // 4. Increment sequence
        globalAuditSeq++;
        
        // 5. Store anchor
        auditCommitments[sessionNonce] = AuditRecord({
            commitmentHash: commitmentHash,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            sequenceNumber: globalAuditSeq,
            recordedBy: msg.sender
        });

        emit EmergencyAuditAnchored(sessionNonce, commitmentHash, uint64(block.timestamp));
    }

    /**
     * @dev Allows an auditor to cryptographically verify if a provided payload hash matches the on-chain anchor.
     */
    function verifyAuditCommitment(bytes32 sessionNonce, bytes32 computedHash) external view returns (bool) {
        AuditRecord memory record = auditCommitments[sessionNonce];
        require(record.timestamp != 0, "Audit record not found");
        return record.commitmentHash == computedHash;
    }
}
