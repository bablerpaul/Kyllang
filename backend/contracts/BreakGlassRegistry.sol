// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IForensicSentinel {
    function isSystemOperational() external view returns (bool);
}

/**
 * @title BreakGlassRegistry
 * @dev Orchestrates and audits Emergency Break-Glass access to patient records.
 * Ensures strict role-based access control and immutable audit trails without 
 * ever storing or transacting plaintext/encrypted shares on-chain.
 */
contract BreakGlassRegistry {
    
    enum EmergencyState { Inactive, Requested, Approved, Active, Revoked, Expired }

    struct EmergencySession {
        bytes32 patientId;
        address requestingDoctor;
        bytes32 admissionTicketHash;
        string ephemeralSessionPubKey; // Stored as base64 or hex string for off-chain enclave routing
        uint256 expirationTimestamp;
        EmergencyState state;
        uint8 attestedShares;
    }

    address public admin;
    address public forensicSentinelRegistry;
    
    // RBAC
    mapping(address => bool) public isERDoctor;
    mapping(address => bool) public isCustodian;
    mapping(address => bool) public isShiftOracle;

    // State Tracking
    mapping(bytes32 => EmergencySession) public sessions;
    
    // sessionId -> (custodianAddress -> hasAttested)
    mapping(bytes32 => mapping(address => bool)) public shareAttestations;

    // Constants
    uint256 public constant SESSION_TIMEOUT_SECONDS = 7200; // 2 hours
    uint8 public constant REQUIRED_SHARES = 3;

    // Events (Audit Trail)
    event DoctorAdded(address indexed doctor);
    event CustodianAdded(address indexed custodian);
    event EmergencyDeclared(bytes32 indexed sessionId, bytes32 indexed patientId, address indexed doctor, string ephemeralPubKey);
    event CustodianShareAttested(bytes32 indexed sessionId, address indexed custodian, bytes32 shareCommitmentHash);
    event EmergencyDecrypted(bytes32 indexed sessionId);
    event EmergencyClosed(bytes32 indexed sessionId, string reason);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyERDoctor() {
        require(isERDoctor[msg.sender], "Not an authorized ER Doctor");
        _;
    }

    modifier onlyCustodian() {
        require(isCustodian[msg.sender], "Not an authorized Custodian");
        _;
    }

    constructor() {
        admin = msg.sender;
        isCustodian[msg.sender] = true; // Admin is usually a custodian in 3-of-5
    }

    // --- RBAC Management ---

    function setERDoctor(address doctor, bool status) external onlyAdmin {
        isERDoctor[doctor] = status;
        if (status) emit DoctorAdded(doctor);
    }

    function setCustodian(address custodian, bool status) external onlyAdmin {
        isCustodian[custodian] = status;
        if (status) emit CustodianAdded(custodian);
    }

    function setForensicSentinelRegistry(address _registry) external onlyAdmin {
        forensicSentinelRegistry = _registry;
    }

    // --- Core Break-Glass Protocol ---

    /**
     * @dev Initiates the emergency break-glass procedure.
     * Generates a deterministic sessionId for tracking.
     */
    function declareEmergency(
        bytes32 patientId,
        bytes32 admissionTicketHash,
        string calldata ephemeralSessionPubKey
    ) external onlyERDoctor returns (bytes32 sessionId) {
        
        // Generate pseudo-random deterministic sessionId
        sessionId = keccak256(abi.encodePacked(patientId, msg.sender, block.timestamp, admissionTicketHash));
        
        // Check Sentinel Guard
        if (forensicSentinelRegistry != address(0)) {
            require(IForensicSentinel(forensicSentinelRegistry).isSystemOperational(), "System Lockdown: Forensic Sentinel alert");
        }

        require(sessions[sessionId].state == EmergencyState.Inactive, "Session collision");

        sessions[sessionId] = EmergencySession({
            patientId: patientId,
            requestingDoctor: msg.sender,
            admissionTicketHash: admissionTicketHash,
            ephemeralSessionPubKey: ephemeralSessionPubKey,
            expirationTimestamp: block.timestamp + SESSION_TIMEOUT_SECONDS,
            state: EmergencyState.Requested,
            attestedShares: 0
        });

        emit EmergencyDeclared(sessionId, patientId, msg.sender, ephemeralSessionPubKey);
    }

    /**
     * @dev Custodians call this to attest they have dual-verified the request
     * and dispatched their encrypted share to the ephemeral session public key off-chain.
     */
    function attestShareRelease(bytes32 sessionId, bytes32 shareCommitmentHash) external onlyCustodian {
        EmergencySession storage session = sessions[sessionId];
        
        require(session.state == EmergencyState.Requested || session.state == EmergencyState.Approved, "Invalid session state");
        require(block.timestamp <= session.expirationTimestamp, "Session expired");
        require(!shareAttestations[sessionId][msg.sender], "Already attested");

        shareAttestations[sessionId][msg.sender] = true;
        session.attestedShares += 1;

        emit CustodianShareAttested(sessionId, msg.sender, shareCommitmentHash);

        if (session.attestedShares >= REQUIRED_SHARES && session.state == EmergencyState.Requested) {
            session.state = EmergencyState.Approved;
        }
    }

    /**
     * @dev The Secure Recovery Enclave logs this event when interpolation succeeds 
     * and streaming begins.
     */
    function logDecryption(bytes32 sessionId) external onlyCustodian {
        EmergencySession storage session = sessions[sessionId];
        require(session.state == EmergencyState.Approved, "Session not approved");
        require(block.timestamp <= session.expirationTimestamp, "Session expired");

        session.state = EmergencyState.Active;
        emit EmergencyDecrypted(sessionId);
    }

    /**
     * @dev Closes the session permanently.
     */
    function closeEmergency(bytes32 sessionId, string calldata reason) external {
        EmergencySession storage session = sessions[sessionId];
        require(
            msg.sender == admin || msg.sender == session.requestingDoctor,
            "Unauthorized to close"
        );
        
        session.state = EmergencyState.Expired;
        session.expirationTimestamp = block.timestamp; // Expire immediately

        emit EmergencyClosed(sessionId, reason);
    }
}
