// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title KeyEscrowRegistry
 * @dev On-chain storage and access control for Patient SSS key escrow fragments.
 * Implements a threshold multi-sig mechanism (3 of 5) for emergency release.
 */
contract KeyEscrowRegistry {
    address public admin;

    struct Point {
        uint256 x;
        uint256 y;
    }

    struct EscrowRecord {
        bytes encryptedShare;
        Point c0;
        Point c1;
        Point c2;
        address trustee;
        bool isUnlocked;
        bool exists;
    }

    // Mapping from patient public key (X25519) to EscrowRecord
    mapping(bytes32 => EscrowRecord) public escrowRecords;

    // Multi-sig State for Emergency Unlock per patient
    mapping(address => bool) public isBoardMember;
    
    // patientPubKey -> (boardMember -> hasApproved)
    mapping(bytes32 => mapping(address => bool)) public unlockApprovals;
    
    // patientPubKey -> number of approvals
    mapping(bytes32 => uint256) public approvalCounts;

    uint256 public constant THRESHOLD = 3;

    event EscrowDeposited(bytes32 indexed patientPubKey, address indexed trustee);
    event UnlockApproved(bytes32 indexed patientPubKey, address indexed boardMember, uint256 currentApprovals);
    event EmergencyUnlocked(bytes32 indexed patientPubKey);
    event BoardMemberAdded(address indexed member);
    event BoardMemberRemoved(address indexed member);

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
        isBoardMember[msg.sender] = true;
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

    // --- Escrow Deposit ---

    function depositEscrow(
        bytes32 patientPubKey,
        bytes calldata encryptedShare,
        Point calldata c0,
        Point calldata c1,
        Point calldata c2,
        address trustee
    ) external {
        // Can be deposited by the patient or a backend relayer.
        // Prevent overwriting existing escrow to prevent malicious replacement, unless admin
        require(!escrowRecords[patientPubKey].exists || msg.sender == admin, "Escrow already exists");

        escrowRecords[patientPubKey] = EscrowRecord({
            encryptedShare: encryptedShare,
            c0: c0,
            c1: c1,
            c2: c2,
            trustee: trustee,
            isUnlocked: false,
            exists: true
        });

        emit EscrowDeposited(patientPubKey, trustee);
    }

    // --- Emergency Multi-Sig ---

    function approveEmergencyUnlock(bytes32 patientPubKey) external onlyBoardMember {
        require(escrowRecords[patientPubKey].exists, "Escrow does not exist");
        require(!escrowRecords[patientPubKey].isUnlocked, "Already unlocked");
        require(!unlockApprovals[patientPubKey][msg.sender], "Already approved");

        unlockApprovals[patientPubKey][msg.sender] = true;
        approvalCounts[patientPubKey]++;
        
        emit UnlockApproved(patientPubKey, msg.sender, approvalCounts[patientPubKey]);

        if (approvalCounts[patientPubKey] >= THRESHOLD) {
            escrowRecords[patientPubKey].isUnlocked = true;
            emit EmergencyUnlocked(patientPubKey);
        }
    }

    // --- Secure View Methods ---

    /**
     * @dev Retrieves the Feldman Commitments. These are mathematically non-sensitive 
     *      commitments over a cryptographic group, so they can be public.
     */
    function getFeldmanCommitments(bytes32 patientPubKey) 
        external 
        view 
        returns (Point memory c0, Point memory c1, Point memory c2) 
    {
        require(escrowRecords[patientPubKey].exists, "Escrow does not exist");
        EscrowRecord storage record = escrowRecords[patientPubKey];
        return (record.c0, record.c1, record.c2);
    }

    /**
     * @dev Retrieves the encrypted share ciphertext (Envelope 2). 
     *      ONLY succeeds if the record has been officially unlocked by the board via multi-sig.
     */
    function getEncryptedShare(bytes32 patientPubKey) 
        external 
        view 
        returns (bytes memory) 
    {
        require(escrowRecords[patientPubKey].exists, "Escrow does not exist");
        require(escrowRecords[patientPubKey].isUnlocked, "Access Denied: Escrow is locked");
        
        return escrowRecords[patientPubKey].encryptedShare;
    }
}
