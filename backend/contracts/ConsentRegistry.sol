// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ConsentRegistry
 * @dev Auditable on-chain registry for granular patient consent and access control.
 * Tracks consent grants and revocations to ensure data access cannot be silently manipulated.
 */
contract ConsentRegistry {
    address public admin;

    struct ConsentRecord {
        bytes32 patientCommitment;
        string grantedTo;
        string scope;
        string recordId; // Can be empty if scope is not record_specific
        string purpose;
        uint256 expiresAt;
        bool isRevoked;
        uint256 timestamp;
    }

    // Mapping of uniquely generated consent IDs to their records
    mapping(bytes32 => ConsentRecord) public consents;

    event ConsentGranted(
        bytes32 indexed consentId,
        bytes32 indexed patientCommitment,
        string indexed grantedTo,
        string scope,
        uint256 expiresAt,
        uint256 timestamp
    );

    event ConsentRevoked(
        bytes32 indexed consentId,
        bytes32 indexed patientCommitment,
        uint256 timestamp
    );

    constructor() {
        admin = msg.sender;
    }

    /**
     * @dev Grant new consent and emit audit event
     */
    function grantConsent(
        bytes32 consentId,
        bytes32 patientCommitment,
        string memory grantedTo,
        string memory scope,
        string memory recordId,
        string memory purpose,
        uint256 expiresAt
    ) external {
        require(consents[consentId].timestamp == 0, "Consent ID already exists");
        require(expiresAt > block.timestamp, "Expiration must be in the future");

        consents[consentId] = ConsentRecord({
            patientCommitment: patientCommitment,
            grantedTo: grantedTo,
            scope: scope,
            recordId: recordId,
            purpose: purpose,
            expiresAt: expiresAt,
            isRevoked: false,
            timestamp: block.timestamp
        });

        emit ConsentGranted(consentId, patientCommitment, grantedTo, scope, expiresAt, block.timestamp);
    }

    /**
     * @dev Revoke active consent
     */
    function revokeConsent(bytes32 consentId) external {
        require(consents[consentId].timestamp != 0, "Consent not found");
        require(!consents[consentId].isRevoked, "Consent already revoked");

        consents[consentId].isRevoked = true;
        
        emit ConsentRevoked(consentId, consents[consentId].patientCommitment, block.timestamp);
    }

    /**
     * @dev Check if consent is still actively valid
     */
    function isConsentActive(bytes32 consentId) external view returns (bool) {
        ConsentRecord memory c = consents[consentId];
        if (c.timestamp == 0) return false;
        if (c.isRevoked) return false;
        if (block.timestamp >= c.expiresAt) return false;
        return true;
    }
}
