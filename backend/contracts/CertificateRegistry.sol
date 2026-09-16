// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CertificateRegistry
 * @author Kyllang Protocol
 * @notice Production-grade ZK certificate registry implementing:
 *   - Role-based issuer authorization (admin-managed allowlist)
 *   - On-chain certificate commitment registration with full audit trail
 *   - Groth16 proof verification via external verifier contract
 *   - Atomic session commitment consumption (TOCTOU-safe)
 *   - Certificate revocation with on-chain traceability
 *   - Trustless client-side verification via static view function
 *
 * @dev Circuit public signal layout (3 signals):
 *   pubSignals[0] = sessionCommitment   — Poseidon2(commitment, nonce) — consumed on-chain
 *   pubSignals[1] = expectedCommitment  — Poseidon4(patientId, diagnosisCode, validFrom, salt)
 *   pubSignals[2] = challengeNonce      — Verifier's ephemeral 248-bit session nonce
 */

interface IGroth16Verifier {
    function verifyProof(
        uint256[2]    calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2]    calldata _pC,
        uint256[3]    calldata _pubSignals
    ) external view returns (bool);
}

contract CertificateRegistry {

    // ── Data Structures ────────────────────────────────────────────────────

    struct CertificateRecord {
        address issuer;           // Authorized doctor/hospital that registered this cert
        uint256 issuedAt;         // Block timestamp of registration
        bool    revoked;          // Revocation flag
        bool    exists;           // Sentinel for mapping existence checks
    }

    // ── State ──────────────────────────────────────────────────────────────

    address public admin;
    IGroth16Verifier public immutable verifier;

    /// @dev Registry of authorized medical issuers (doctors / hospitals)
    mapping(address => bool) public authorizedIssuers;

    /// @dev commitmentHash (bytes32) → CertificateRecord
    mapping(bytes32 => CertificateRecord) public registeredCertificates;

    /// @dev sessionCommitment (Poseidon(commitment, nonce)) → blockNumber consumed
    ///      Zero means not yet consumed. Atomic consumption prevents TOCTOU races.
    mapping(bytes32 => uint256) public consumedSessions;

    // ── Events ─────────────────────────────────────────────────────────────

    event IssuerAdded(address indexed issuer, uint256 timestamp);
    event IssuerRemoved(address indexed issuer, uint256 timestamp);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event CertificateRegistered(
        bytes32 indexed commitmentHash,
        address indexed issuer,
        uint256 timestamp
    );
    event CertificateRevoked(
        bytes32 indexed commitmentHash,
        address indexed revokedBy,
        uint256 timestamp
    );
    event CertificateVerified(
        bytes32 indexed commitmentHash,
        bytes32 indexed sessionCommitment,
        address indexed verifiedBy,
        uint256 blockNumber
    );

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "Registry: caller is not admin");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Registry: caller is not an authorized issuer");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    /**
     * @param _verifier Address of the deployed Groth16Verifier contract
     */
    constructor(address _verifier) {
        require(_verifier != address(0), "Registry: verifier cannot be zero address");
        admin    = msg.sender;
        verifier = IGroth16Verifier(_verifier);
        // Auto-authorize deployer as initial issuer for bootstrapping
        authorizedIssuers[msg.sender] = true;
        emit IssuerAdded(msg.sender, block.timestamp);
    }

    // ── Admin Functions ────────────────────────────────────────────────────

    /**
     * @notice Add an address to the authorized issuers registry
     * @param issuer The doctor/hospital wallet address to authorize
     */
    function addIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Registry: zero address not allowed");
        require(!authorizedIssuers[issuer], "Registry: already authorized");
        authorizedIssuers[issuer] = true;
        emit IssuerAdded(issuer, block.timestamp);
    }

    /**
     * @notice Remove an address from the authorized issuers registry
     * @param issuer The issuer address to deauthorize
     */
    function removeIssuer(address issuer) external onlyAdmin {
        require(authorizedIssuers[issuer], "Registry: not an authorized issuer");
        authorizedIssuers[issuer] = false;
        emit IssuerRemoved(issuer, block.timestamp);
    }

    /**
     * @notice Transfer admin role to a new address
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Registry: zero address not allowed");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ── Issuer Functions ───────────────────────────────────────────────────

    /**
     * @notice Register a certificate commitment hash on-chain.
     *         Only callable by authorized issuers using their own wallet.
     *         This directly attributes issuance to the calling doctor's key,
     *         preventing backend hot-wallet impersonation.
     *
     * @param commitmentHash Poseidon4(patientId, diagnosisCode, validFrom, salt)
     *                       computed client-side by the doctor's browser
     */
    function registerCertificate(bytes32 commitmentHash) external onlyAuthorizedIssuer {
        require(commitmentHash != bytes32(0), "Registry: zero commitment not allowed");
        require(!registeredCertificates[commitmentHash].exists, "Registry: already registered");

        registeredCertificates[commitmentHash] = CertificateRecord({
            issuer:   msg.sender,
            issuedAt: block.timestamp,
            revoked:  false,
            exists:   true
        });

        emit CertificateRegistered(commitmentHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Revoke a certificate. Callable by the original issuer or admin.
     *         Once revoked, all subsequent verification attempts will fail.
     *
     * @param commitmentHash The commitment hash of the certificate to revoke
     */
    function revokeCertificate(bytes32 commitmentHash) external {
        CertificateRecord storage record = registeredCertificates[commitmentHash];
        require(record.exists, "Registry: certificate not found");
        require(!record.revoked, "Registry: already revoked");
        require(
            record.issuer == msg.sender || msg.sender == admin,
            "Registry: not authorized to revoke"
        );

        record.revoked = true;
        emit CertificateRevoked(commitmentHash, msg.sender, block.timestamp);
    }

    // ── Verification Functions ─────────────────────────────────────────────

    /**
     * @notice State-changing verification: validates proof AND atomically consumes
     *         the session commitment to prevent replay attacks.
     *
     *         TOCTOU-safe: state update (consumedSessions) happens BEFORE the
     *         external verifier call. Re-entrancy cannot exploit the nonce check.
     *
     *         Checks (in order of cheapest to most expensive):
     *           1. Certificate exists and is not revoked (storage read)
     *           2. Session commitment is fresh (storage read)
     *           3. Groth16 proof is mathematically valid (expensive computation)
     *
     * @param _pA  Groth16 proof component A  (from snarkjs)
     * @param _pB  Groth16 proof component B  (from snarkjs)
     * @param _pC  Groth16 proof component C  (from snarkjs)
     * @param pubSignals [sessionCommitment, expectedCommitment, challengeNonce]
     * @return true on successful verification
     */
    function verifyCertificateProof(
        uint256[2]    calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2]    calldata _pC,
        uint256[3]    calldata pubSignals
    ) external returns (bool) {
        // MATCH SNARKJS OUTPUT ORDER: [expectedCommitment, sessionCommitment, nonce]
        bytes32 commitmentHash    = bytes32(pubSignals[0]);
        bytes32 sessionCommitment = bytes32(pubSignals[1]);

        // ① Certificate must exist and not be revoked
        CertificateRecord storage record = registeredCertificates[commitmentHash];
        require(record.exists,   "Registry: certificate not registered");
        require(!record.revoked, "Registry: certificate has been revoked");

        // ② Atomic nonce consumption (TOCTOU mitigation: write BEFORE external call)
        require(consumedSessions[sessionCommitment] == 0, "Registry: session already consumed (replay blocked)");
        consumedSessions[sessionCommitment] = block.number;

        // ③ Groth16 proof verification (external call after state update)
        require(
            verifier.verifyProof(_pA, _pB, _pC, pubSignals),
            "Registry: Groth16 proof verification failed"
        );

        emit CertificateVerified(commitmentHash, sessionCommitment, msg.sender, block.number);
        return true;
    }

    /**
     * @notice Read-only static verification for trustless client-side checking.
     *         The Verifier frontend can call this via eth_call without submitting
     *         a transaction, independently verifying all conditions without
     *         trusting the backend.
     *
     * @return valid            true if proof is mathematically valid AND cert OK
     * @return certExists       whether the commitment is registered
     * @return certRevoked      whether the certificate has been revoked
     * @return sessionConsumed  whether this session has already been used
     * @return issuer           the registered issuer address (zero if not found)
     * @return issuedAt         the registration timestamp (zero if not found)
     */
    function verifyCertificateProofStatic(
        uint256[2]    calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2]    calldata _pC,
        uint256[3]    calldata pubSignals
    ) external view returns (
        bool valid,
        bool certExists,
        bool certRevoked,
        bool sessionConsumed,
        address issuer,
        uint256 issuedAt
    ) {
        bytes32 sessionCommitment = bytes32(pubSignals[0]);
        bytes32 commitmentHash    = bytes32(pubSignals[1]);

        CertificateRecord storage record = registeredCertificates[commitmentHash];
        certExists     = record.exists;
        certRevoked    = record.revoked;
        sessionConsumed= consumedSessions[sessionCommitment] != 0;
        issuer         = record.issuer;
        issuedAt       = record.issuedAt;

        // Only run expensive Groth16 check if all cheaper checks pass
        if (certExists && !certRevoked && !sessionConsumed) {
            valid = verifier.verifyProof(_pA, _pB, _pC, pubSignals);
        }
    }

    // ── View Helpers ───────────────────────────────────────────────────────

    /**
     * @notice Get full certificate record for a given commitment hash
     */
    function getCertificateRecord(bytes32 commitmentHash)
        external
        view
        returns (address issuer, uint256 issuedAt, bool revoked, bool exists)
    {
        CertificateRecord storage r = registeredCertificates[commitmentHash];
        return (r.issuer, r.issuedAt, r.revoked, r.exists);
    }

    /**
     * @notice Check if a session commitment has been consumed
     */
    function isSessionConsumed(bytes32 sessionCommitment) external view returns (bool) {
        return consumedSessions[sessionCommitment] != 0;
    }
}
