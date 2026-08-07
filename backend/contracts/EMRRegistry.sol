// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EMRRegistry
 * @dev Extended Smart Contract for Hospital Electronic Medical Record (EMR) System.
 * Anchors cryptographic hashes and IPFS CIDs for Medical Records, Lab Reports,
 * Prescriptions, Medical Certificates, and Insurance Claims while preserving legacy functionality.
 */
contract EMRRegistry {
    address public owner;

    // --- Legacy Certificate & Batch Anchor Functionality (Preserved 100%) ---
    struct Anchor {
        string batchHash;
        uint256 timestamp;
    }

    Anchor[] public anchors;

    event HashAnchored(string batchHash, uint256 timestamp);

    // --- Extended EMR Record Anchoring Functionality ---
    struct EMRRecord {
        string patientId;    // Patient ID
        string recordType;   // Record Type: "MedicalRecord", "LabReport", "Prescription", "MedicalCertificate", "InsuranceClaim"
        string dataHash;     // SHA256 Data Hash
        uint256 timestamp;   // Block timestamp
        string ipfsCid;      // IPFS Content Identifier (CID)
        address recordOwner; // Owner / Submitter wallet address
    }

    EMRRecord[] public emrRecords;

    // Mapping from patient ID to list of EMR record indices
    mapping(string => uint256[]) private patientRecordIndices;

    // Mapping from dataHash to index + 1 for instant verification
    mapping(string => uint256) private hashToRecordIndex;

    // --- Commit-Reveal State ---
    mapping(address => bytes32) public commitments;

    event RecordAnchored(
        string indexed patientId,
        string recordType,
        string dataHash,
        string ipfsCid,
        uint256 timestamp,
        address indexed recordOwner
    );

    event HashCommitted(address indexed committer, bytes32 commitment);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this operation");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // --- Commit-Reveal Functions ---

    /**
     * @dev Step 1: Commit to a hash to prevent front-running
     */
    function commitHash(bytes32 commitment) external {
        commitments[msg.sender] = commitment;
        emit HashCommitted(msg.sender, commitment);
    }

    // --- Existing Legacy Certificate / Batch Anchoring Functions ---

    /**
     * @dev Legacy storeHash method to anchor batch hashes onto blockchain
     * @param _batchHash The cryptographic hash string to anchor
     */
    function storeHash(string memory _batchHash) public {
        require(bytes(_batchHash).length > 0, "Batch hash cannot be empty");
        anchors.push(Anchor({
            batchHash: _batchHash,
            timestamp: block.timestamp
        }));
        emit HashAnchored(_batchHash, block.timestamp);
    }

    /**
     * @dev Get anchor details by index
     */
    function getAnchor(uint256 index) public view returns (string memory, uint256) {
        require(index < anchors.length, "Anchor index out of bounds");
        Anchor memory a = anchors[index];
        return (a.batchHash, a.timestamp);
    }

    /**
     * @dev Get total count of legacy anchors
     */
    function getTotalAnchors() public view returns (uint256) {
        return anchors.length;
    }

    // --- Extended EMR Record Anchoring Functions ---

    /**
     * @dev Step 2: Reveal and store EMR record
     */
    function revealHash(
        string memory _patientId,
        string memory _recordType,
        string memory _dataHash,
        string memory _ipfsCid,
        bytes32 nonce
    ) external {
        require(bytes(_patientId).length > 0, "Patient ID required");
        require(bytes(_recordType).length > 0, "Record Type required");
        require(bytes(_dataHash).length > 0, "Data hash required");

        // Verify the commit-reveal
        bytes32 recordHash = keccak256(abi.encodePacked(_dataHash));
        require(
            commitments[msg.sender] == keccak256(abi.encodePacked(recordHash, nonce, msg.sender)),
            "Commitment mismatch"
        );
        
        // Clear commitment
        commitments[msg.sender] = bytes32(0);

        EMRRecord memory record = EMRRecord({
            patientId: _patientId,
            recordType: _recordType,
            dataHash: _dataHash,
            timestamp: block.timestamp,
            ipfsCid: _ipfsCid,
            recordOwner: msg.sender
        });

        emrRecords.push(record);
        uint256 newIndex = emrRecords.length - 1;

        patientRecordIndices[_patientId].push(newIndex);
        hashToRecordIndex[_dataHash] = newIndex + 1; // 1-indexed to differentiate from 0

        // Also push to legacy anchors array for backward compatibility
        anchors.push(Anchor({
            batchHash: _dataHash,
            timestamp: block.timestamp
        }));
        emit HashAnchored(_dataHash, block.timestamp);

        emit RecordAnchored(
            _patientId,
            _recordType,
            _dataHash,
            _ipfsCid,
            block.timestamp,
            msg.sender
        );
    }

    /**
     * @dev Get EMR Record by index
     */
    function getEMRRecord(uint256 index)
        public
        view
        returns (
            string memory patientId,
            string memory recordType,
            string memory dataHash,
            uint256 timestamp,
            string memory ipfsCid,
            address recordOwner
        )
    {
        require(index < emrRecords.length, "EMR record index out of bounds");
        EMRRecord memory r = emrRecords[index];
        return (
            r.patientId,
            r.recordType,
            r.dataHash,
            r.timestamp,
            r.ipfsCid,
            r.recordOwner
        );
    }

    /**
     * @dev Get total count of anchored EMR records
     */
    function getTotalEMRRecords() public view returns (uint256) {
        return emrRecords.length;
    }

    /**
     * @dev Get all record indices anchored for a specific patient
     */
    function getPatientRecordIndices(string memory _patientId)
        public
        view
        returns (uint256[] memory)
    {
        return patientRecordIndices[_patientId];
    }

    /**
     * @dev Verify if a data hash exists on-chain and retrieve its timestamp
     */
    function verifyRecordHash(string memory _dataHash)
        public
        view
        returns (
            bool exists,
            uint256 timestamp,
            string memory patientId,
            string memory recordType,
            string memory ipfsCid,
            address recordOwner
        )
    {
        uint256 idxPlusOne = hashToRecordIndex[_dataHash];
        if (idxPlusOne == 0) {
            return (false, 0, "", "", "", address(0));
        }
        uint256 idx = idxPlusOne - 1;
        EMRRecord memory r = emrRecords[idx];
        return (true, r.timestamp, r.patientId, r.recordType, r.ipfsCid, r.recordOwner);
    }
}
