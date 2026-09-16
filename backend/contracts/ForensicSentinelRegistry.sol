// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts@4.9.3/utils/cryptography/ECDSA.sol";

/**
 * @title ForensicSentinelRegistry
 * @dev Out-of-band sentinel contract that tracks the database state root
 * and implements a Dead-Man's switch to autonomously freeze operations if the
 * backend database is silently compromised, rolled back, or silenced.
 */
contract ForensicSentinelRegistry {
    using ECDSA for bytes32;

    enum SystemStatus { Operational, Warning, FrozenByTamper, FrozenByTimeout }

    // Core State
    bytes32 public lastKnownGoodRoot;
    uint256 public stateSequence;
    
    // Heartbeat / Dead-Man's Switch
    uint256 public lastHeartbeatBlock;
    uint256 public heartbeatTimeoutWindow; // Max allowed blocks between heartbeats
    
    SystemStatus public systemStatus;

    address public admin;
    address public sentinelAddress;

    // Multi-Sig Config
    mapping(address => bool) public isAuthorizedSigner;
    uint256 public constant REQUIRED_SIGNATURES = 2; // 2-of-M multi-sig

    // Events
    event RootUpdated(bytes32 newRoot, uint256 newSequence);
    event HeartbeatRecorded(bytes32 observedRoot, uint256 sequenceNumber, uint256 blockNumber);
    event TamperDetected(bytes32 expectedRoot, bytes32 observedRoot);
    event DeadManSwitchTriggered(uint256 lastHeartbeat, uint256 currentBlock);
    event SystemLockdownActivated(SystemStatus reason, bytes32 observedRoot);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlySentinel() {
        require(msg.sender == sentinelAddress, "Not authorized Sentinel");
        _;
    }

    constructor(address _sentinelAddress, uint256 _timeoutWindowBlocks) {
        admin = msg.sender;
        sentinelAddress = _sentinelAddress;
        heartbeatTimeoutWindow = _timeoutWindowBlocks;
        
        systemStatus = SystemStatus.Operational;
        stateSequence = 0;
        lastHeartbeatBlock = block.number;
    }

    // --- Configuration ---

    function setAuthorizedSigner(address signer, bool status) external onlyAdmin {
        isAuthorizedSigner[signer] = status;
    }

    function setHeartbeatTimeout(uint256 _timeoutWindowBlocks) external onlyAdmin {
        heartbeatTimeoutWindow = _timeoutWindowBlocks;
    }

    // --- Multi-Sig State Root Governance ---

    /**
     * @dev Updates the canonical database state root. Requires Multi-Sig approval.
     * Enforces strictly monotonic sequence chaining (Anti-Rollback).
     */
    function updateApprovedRoot(
        bytes32 newRoot,
        uint256 newSequence,
        bytes[] memory signatures
    ) external {
        require(newSequence == stateSequence + 1, "Non-monotonic sequence increment");
        require(signatures.length >= REQUIRED_SIGNATURES, "Insufficient signatures");
        require(systemStatus == SystemStatus.Operational, "System is not operational");

        // Message Hash: H(newRoot || newSequence || chainId || contractAddress)
        bytes32 messageHash = keccak256(abi.encodePacked(newRoot, newSequence, block.chainid, address(this)));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        address lastSigner = address(0);
        uint256 validSignatures = 0;

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ethSignedMessageHash.recover(signatures[i]);
            
            // Ensure unique signers by requiring sorted signatures
            require(uint160(signer) > uint160(lastSigner), "Invalid or duplicate signer");
            require(isAuthorizedSigner[signer], "Signer not authorized");

            lastSigner = signer;
            validSignatures++;
        }

        require(validSignatures >= REQUIRED_SIGNATURES, "Validation failed");

        // Update State
        lastKnownGoodRoot = newRoot;
        stateSequence = newSequence;
        lastHeartbeatBlock = block.number; // Valid update counts as activity

        emit RootUpdated(newRoot, newSequence);
    }

    // --- Sentinel Operations ---

    /**
     * @dev Sentinel periodically calls this to prove the DB matches the approved root.
     */
    function submitHeartbeat(bytes32 observedRoot, uint256 sequenceNumber) external onlySentinel {
        // Explicitly check timeout first
        if (block.number > lastHeartbeatBlock + heartbeatTimeoutWindow) {
            systemStatus = SystemStatus.FrozenByTimeout;
            emit DeadManSwitchTriggered(lastHeartbeatBlock, block.number);
            emit SystemLockdownActivated(systemStatus, observedRoot);
            return;
        }

        require(systemStatus == SystemStatus.Operational || systemStatus == SystemStatus.Warning, "System locked");

        if (sequenceNumber != stateSequence || observedRoot != lastKnownGoodRoot) {
            systemStatus = SystemStatus.Warning;
            emit TamperDetected(lastKnownGoodRoot, observedRoot);
        } else {
            // Heartbeat OK
            systemStatus = SystemStatus.Operational;
            lastHeartbeatBlock = block.number;
            emit HeartbeatRecorded(observedRoot, sequenceNumber, block.number);
        }
    }

    /**
     * @dev Sentinel instantly freezes the system if mismatch persists or is proven.
     */
    function triggerEmergencyLockdown(bytes32 observedRoot, bytes memory /* proofOfMismatch */) external onlySentinel {
        systemStatus = SystemStatus.FrozenByTamper;
        emit SystemLockdownActivated(systemStatus, observedRoot);
    }

    // --- Integration Interface ---

    /**
     * @dev Evaluates whether dependent systems (like Break-Glass) can operate.
     * Evaluates the Dead-Man's switch in real-time.
     */
    function isSystemOperational() public view returns (bool) {
        if (systemStatus != SystemStatus.Operational) return false;
        
        // Dead-Man's switch logic
        if (block.number > lastHeartbeatBlock + heartbeatTimeoutWindow) {
            return false;
        }

        return true;
    }
}
