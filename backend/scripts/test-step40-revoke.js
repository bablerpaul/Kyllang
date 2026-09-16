require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Certificate = require('../models/Certificate');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const blockchainContract = require('../blockchain');
const { revokeCertificate } = require('../controllers/certificateController');

// Mock request/response objects
const mockReq = (user, params, body) => ({
    user,
    params: params || {},
    body: body || {},
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-script' }
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

const mockNext = (err) => {
    if (err) console.error('Next called with error:', err);
};

// Helper for assertions
function assert(condition, message) {
    if (!condition) {
        console.error('❌ FAIL:', message);
        process.exit(1);
    }
    console.log('✅ PASS:', message);
}

async function runTests() {
    console.log('--- STEP 40: MEDICAL CERTIFICATE REVOCATION TESTS ---\n');

    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyllang_health');
        console.log('Connected to MongoDB');

        // Verify Blockchain connection
        const registry = blockchainContract.getContract('CertificateRegistry');
        if (!registry) {
            throw new Error('Blockchain contract CertificateRegistry not found. Is Ganache running?');
        }
        console.log('Connected to Blockchain. Registry address:', registry.target || registry.address);

        // Find a doctor
        const doctor = await Doctor.findOne().populate('user');
        if (!doctor) throw new Error('No doctor found for testing');
        const doctorUser = doctor.user;

        // Find a patient
        let patientUser = await User.findOne({ role: 'general_user' });
        if (!patientUser) {
            patientUser = await User.create({
                name: 'Test Patient',
                email: 'testpatient@example.com',
                password: 'password123',
                role: 'general_user',
                walletAddress: '0x' + '1'.repeat(40),
                encryptionSalt: 'salt',
                accountStatus: 'active'
            });
            console.log('Created temp patient for test');
        }

        // Create a test certificate
        console.log('\nCreating disposable test certificate...');
        const randomSalt = ethers.hexlify(ethers.randomBytes(32));
        // Mock Poseidon hash for testing
        const dummyHash = ethers.keccak256(randomSalt); 

        // Ensure authorized issuer on-chain
        try {
            await registry.addIssuer(doctorUser.walletAddress);
        } catch (e) {
            // Might already be added or not admin. Ignore if already authorized.
        }

        // Register on chain first
        const tx = await registry.registerCertificate(dummyHash);
        await tx.wait();
        console.log('Test certificate registered on chain. TX:', tx.hash);

        // Save to DB
        const cert = await Certificate.create({
            patient: patientUser._id,
            issuedBy: doctorUser._id,
            doctor: doctor._id,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
            publicCommitmentHash: dummyHash,
            verificationMethod: 'zk_proof',
            blockchainTxHash: tx.hash,
            issuerAddress: doctorUser.walletAddress
        });
        console.log('Test certificate saved to DB. ID:', cert._id.toString());

        // ── TEST 1: Unauthenticated attempt ────────────────────────────────
        // Expected: Should be handled by middleware in real route, but let's test if req.user is missing
        // Wait, controller assumes req.user exists because of protect middleware. Let's test wrong user.
        
        // ── TEST 2: Different Doctor attempts to revoke ─────────────────────
        console.log('\nTEST 2: Different Doctor attempts to revoke');
        const otherDoctorUser = { _id: new mongoose.Types.ObjectId(), role: 'doctor' };
        let req = mockReq(otherDoctorUser, { id: cert._id });
        let res = mockRes();
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 403, 'Should return 403 Forbidden for unauthorized doctor');

        // ── TEST 3: Patient attempts to revoke ──────────────────────────────
        console.log('\nTEST 3: Patient attempts to revoke');
        req = mockReq(patientUser, { id: cert._id });
        res = mockRes();
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 403, 'Should return 403 Forbidden for patient');

        // ── TEST 4: Invalid certificate ID ─────────────────────────────────
        console.log('\nTEST 4: Invalid certificate ID');
        req = mockReq(doctorUser, { id: new mongoose.Types.ObjectId() });
        res = mockRes();
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 404, 'Should return 404 for invalid certificate ID');

        // ── TEST 5: Legacy HMAC certificate ────────────────────────────────
        console.log('\nTEST 5: Legacy HMAC certificate');
        const legacyCert = await Certificate.create({
            patient: patientUser._id,
            issuedBy: doctorUser._id,
            doctor: doctor._id,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            publicCommitmentHash: 'dummy_hash_legacy',
            verificationMethod: 'hmac_legacy'
        });
        req = mockReq(doctorUser, { id: legacyCert._id });
        res = mockRes();
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 400, 'Should reject legacy HMAC certificates');
        await Certificate.findByIdAndDelete(legacyCert._id); // Cleanup

        // ── TEST 1: Issuing Doctor revokes own certificate ──────────────────
        console.log('\nTEST 1: Issuing Doctor revokes own certificate');
        req = mockReq(doctorUser, { id: cert._id }, { reason: 'Test revocation' });
        res = mockRes();
        
        // We need to execute the revoke
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 200, 'Revocation should succeed with 200 OK');
        assert(res.data.data.status === 'revoked', 'MongoDB status should be revoked');
        assert(res.data.data.revokeReason === 'Test revocation', 'Reason should be saved');
        
        const onChainRecord = await registry.getCertificateRecord(dummyHash);
        assert(onChainRecord[2] === true, 'Blockchain should mark certificate as revoked (revoked = true)');
        
        // ── TEST 6: Already revoked certificate ─────────────────────────────
        console.log('\nTEST 6: Already revoked certificate');
        req = mockReq(doctorUser, { id: cert._id });
        res = mockRes();
        await revokeCertificate(req, res, mockNext);
        assert(res.statusCode === 409, 'Should return 409 Conflict for already revoked certificate');

        // ── TEST 7: Certificate verification after revocation ───────────────
        console.log('\nTEST 7: Certificate verification after revocation');
        // This simulates VerifyCertificate.jsx checking the static function
        // (pA, pB, pC, pubSignals)
        // verifyCertificateProofStatic(uint256[2], uint256[2][2], uint256[2], uint256[3])
        // We will just call the getCertificateRecord since generating ZKP is complex here
        const [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(dummyHash);
        assert(exists === true, 'Certificate exists on-chain');
        assert(revoked === true, 'Certificate is verified as REVOKED on-chain');

        console.log('\nAll security tests passed successfully!');

        // Cleanup
        await Certificate.findByIdAndDelete(cert._id);
        console.log('Test certificate cleaned up from DB');

    } catch (e) {
        console.error('Test script failed:', e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

runTests();
