process.env.MASTER_ENCRYPTION_KEY = 'test_key_for_jest_0000000000000000';
const mongoose = require('mongoose');
const certificateController = require('../controllers/certificateController');
const snarkjsService = require('../src/utils/snarkjsService');
const snarkjs = require('snarkjs');
const fs = require('fs');

// Mock snarkjs, fs, and blockchain
jest.mock('snarkjs', () => ({
    groth16: {
        verify: jest.fn()
    }
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn()
}));

const mockZkContract = {
    isNullifierConsumed: jest.fn(),
    consumeNullifier: jest.fn(() => ({ wait: jest.fn() }))
};

jest.mock('../blockchain', () => ({
    getContract: jest.fn(() => mockZkContract)
}));

// Mock Mongoose model
const mockCertificate = {
    verificationHash: 'valid_cert_hash',
    patient: { name: 'Test Patient' }
};

jest.mock('../models/Certificate', () => ({
    findOne: jest.fn(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCertificate)
    }))
}));

// Helper to create mock req and res
const mockReqRes = (body) => {
    const req = { body };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    const next = jest.fn();
    return { req, res, next };
};

describe('ZKP Fallback & Security Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default mocks for a "working" environment
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath.includes('verification_key.json')) return true;
            return false;
        });
        fs.readFileSync.mockImplementation((filePath) => {
            if (filePath.includes('verification_key.json')) return JSON.stringify({ mock: 'vkey' });
            return null;
        });
        
        process.env.NODE_ENV = 'production';
    });

    test('A. Valid Groth16 proof -> PASS', async () => {
        snarkjs.groth16.verify.mockResolvedValue(true);
        mockZkContract.isNullifierConsumed.mockResolvedValue(false);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { valid: 'proof' },
            publicSignals: ['nullifier_A', 'valid_cert_hash']
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(snarkjs.groth16.verify).toHaveBeenCalled();
        expect(mockZkContract.isNullifierConsumed).toHaveBeenCalledWith('nullifier_A');
    });

    test('B. Invalid proof -> FAIL', async () => {
        snarkjs.groth16.verify.mockResolvedValue(false);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { invalid: 'proof' },
            publicSignals: ['nullifier_B', 'valid_cert_hash']
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Invalid ZK Proof' }));
    });

    test('C. Modified public signal -> FAIL', async () => {
        // If public signals are modified, snarkjs verify mathematically fails
        snarkjs.groth16.verify.mockResolvedValue(false);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { valid: 'proof' },
            publicSignals: ['nullifier_B', 'tampered_hash'] // modified
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('D. Missing .zkey/WASM -> FAIL CLOSED', async () => {
        // Simulate missing verification_key.json
        fs.existsSync.mockImplementation((filePath) => false);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { valid: 'proof' },
            publicSignals: ['nullifier_C', 'valid_cert_hash']
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        // We use string containing since error messages vary
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error: expect.stringContaining('Verification failed: ZK configuration is missing')
        }));
    });

    test('E. Replayed nullifier -> FAIL', async () => {
        snarkjs.groth16.verify.mockResolvedValue(true);
        // Simulate on-chain contract saying the nullifier is already consumed
        mockZkContract.isNullifierConsumed.mockResolvedValue(true);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { valid: 'proof' },
            publicSignals: ['nullifier_already_used', 'valid_cert_hash']
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: expect.stringContaining('Replay attack')
        }));
    });

    test('F. Valid unique nullifier -> PASS', async () => {
        snarkjs.groth16.verify.mockResolvedValue(true);
        mockZkContract.isNullifierConsumed.mockResolvedValue(false);

        const { req, res, next } = mockReqRes({
            verificationMethod: 'zk_proof',
            zkProof: { valid: 'proof' },
            publicSignals: ['nullifier_fresh', 'valid_cert_hash']
        });

        await certificateController.verifyCertificate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(mockZkContract.consumeNullifier).toHaveBeenCalledWith('nullifier_fresh');
    });
});
