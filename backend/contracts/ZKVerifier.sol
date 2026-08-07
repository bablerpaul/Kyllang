// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ZKVerifier
 * @dev KYLLANG_V4: Nullifier registry and SRI pinned artifact management.
 * Dual-path verification: standard HMAC path remains, while ZK path checks 
 * nullifiers to prevent replay attacks on ZK proofs.
 */
contract ZKVerifier {
    address public admin;

    // Mapping of ZK nullifier to block number it was consumed
    mapping(bytes32 => uint256) public consumedNullifiers;

    // SRI (Subresource Integrity) hashes for ZK artifacts
    mapping(string => string) public sriHashes;

    event NullifierConsumed(bytes32 indexed nullifier, uint256 blockNumber);
    event SriHashUpdated(string artifactName, string sriHash);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @dev Check if a ZK nullifier has been consumed.
     */
    function isNullifierConsumed(bytes32 nullifier) external view returns (bool) {
        return consumedNullifiers[nullifier] != 0;
    }

    /**
     * @dev Consume a ZK nullifier during proof verification.
     */
    function consumeNullifier(bytes32 nullifier) external {
        require(consumedNullifiers[nullifier] == 0, "Nullifier already consumed");
        consumedNullifiers[nullifier] = block.number;
        emit NullifierConsumed(nullifier, block.number);
    }

    /**
     * @dev Update SRI hash for a ZK artifact.
     */
    function setSriHash(string calldata artifactName, string calldata sriHash) external onlyAdmin {
        sriHashes[artifactName] = sriHash;
        emit SriHashUpdated(artifactName, sriHash);
    }
}
