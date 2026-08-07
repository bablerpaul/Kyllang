// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title EmergencyEscrow
 * @dev KYLLANG_V4: On-chain session management for TPRE proxy nodes and MCI epochs.
 * Break-glass access (MCI) is governed by a 3-of-5 multi-signature schema with a 24-hour TTL.
 */
contract EmergencyEscrow {
    address public admin;

    struct Session {
        bool active;
        uint256 expiresAt;
        address doctorAddress;
    }

    // Mapping from vrfLookupToken -> Session
    mapping(bytes32 => Session) public sessions;

    // MCI Multi-sig State
    uint256 public mciExpiresAt;
    uint256 public mciEpoch;
    mapping(address => bool) public isBoardMember;
    mapping(uint256 => mapping(address => bool)) public mciApprovals;
    uint256 public mciApprovalCount;
    uint256 public constant THRESHOLD = 3;
    uint256 public constant MCI_TTL = 24 hours;

    event SessionOpened(bytes32 indexed vrfLookupToken, address indexed doctorAddress, uint256 expiresAt);
    event SessionClosed(bytes32 indexed vrfLookupToken);
    event MCIActivated(uint256 expiresAt, uint256 epoch);
    event MCIDeactivated(uint256 epoch);
    event BoardMemberAdded(address indexed member);
    event BoardMemberRemoved(address indexed member);
    event MCIApproved(address indexed member, uint256 epoch, uint256 currentApprovals);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyBoardMember() {
        require(isBoardMember[msg.sender] || msg.sender == admin, "Not authorized");
        _;
    }

    constructor() {
        admin = msg.sender;
        mciEpoch = 1;
    }

    // --- Board Member Management ---

    function addBoardMember(address member) external onlyAdmin {
        isBoardMember[member] = true;
        emit BoardMemberAdded(member);
    }

    function removeBoardMember(address member) external onlyAdmin {
        isBoardMember[member] = false;
        emit BoardMemberRemoved(member);
    }

    // --- Session Management ---

    function openSession(bytes32 vrfLookupToken, address doctorAddress, uint256 durationSeconds) external onlyAdmin {
        sessions[vrfLookupToken] = Session({
            active: true,
            expiresAt: block.timestamp + durationSeconds,
            doctorAddress: doctorAddress
        });
        emit SessionOpened(vrfLookupToken, doctorAddress, block.timestamp + durationSeconds);
    }

    function closeSession(bytes32 vrfLookupToken) external onlyAdmin {
        require(sessions[vrfLookupToken].active, "Session not active");
        sessions[vrfLookupToken].active = false;
        sessions[vrfLookupToken].expiresAt = block.timestamp;
        emit SessionClosed(vrfLookupToken);
    }

    function getSession(bytes32 vrfLookupToken, address requestingDoctorAddress) external view returns (bool active, uint256 expiresAt) {
        Session memory session = sessions[vrfLookupToken];
        bool mciActive = block.timestamp <= mciExpiresAt;
        bool isAuthorized = (session.doctorAddress == requestingDoctorAddress) || mciActive;
        return (session.active && isAuthorized, session.expiresAt);
    }

    // --- MCI Multi-Sig ---

    function approveMCI() external onlyBoardMember {
        require(block.timestamp > mciExpiresAt, "MCI is already active");
        require(!mciApprovals[mciEpoch][msg.sender], "Already approved in current epoch");

        mciApprovals[mciEpoch][msg.sender] = true;
        mciApprovalCount++;
        emit MCIApproved(msg.sender, mciEpoch, mciApprovalCount);

        if (mciApprovalCount >= THRESHOLD) {
            // Activate MCI
            mciExpiresAt = block.timestamp + MCI_TTL;
            mciEpoch++; // Reset approvals for next potential MCI
            mciApprovalCount = 0;
            emit MCIActivated(mciExpiresAt, mciEpoch - 1);
        }
    }

    function deactivateMCI() external onlyAdmin {
        require(block.timestamp <= mciExpiresAt, "MCI not active");
        mciExpiresAt = block.timestamp; // Expire immediately
        emit MCIDeactivated(mciEpoch - 1);
    }
}
