const axios = require('axios');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/../.env' });

const API_BASE = 'http://localhost:5000/api';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:7545';

async function run() {
    console.log("==========================================");
    console.log("STEP 40C — REAL CERTIFICATE REVOCATION E2E");
    console.log("==========================================\n");

    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kyllang');
        console.log("[MongoDB] Connected");

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const block = await provider.getBlockNumber();
        console.log(`[Ganache] Connected at block ${block}`);
        const chainId = (await provider.getNetwork()).chainId;
        console.log(`[Ganache] Chain ID: ${chainId}`);

        const registryAddress = process.env.CERT_REGISTRY_ADDRESS;
        console.log(`[Contract] CertificateRegistry Address: ${registryAddress}`);
        
        const bytecode = await provider.getCode(registryAddress);
        if (bytecode === '0x') {
            throw new Error('CertificateRegistry has no bytecode! Deployment failed.');
        }
        console.log(`[Contract] CertificateRegistry Bytecode exists: true`);

        const manifest = path.join(__dirname, '../../certificate-portal/public/zk/CertificateRegistry.abi.json');
        let abi = JSON.parse(fs.readFileSync(manifest, 'utf8')).abi;

        const registry = new ethers.Contract(registryAddress, abi, provider);

        // 1. LOGIN
        const docLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'testdoctor1@test.com', password: 'Password123!'
        });
        const docToken = docLogin.data.data.token;
        const patLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'testpatient1@test.com', password: 'Password123!'
        });
        const patToken = patLogin.data.data.token;
        const patId = patLogin.data.data._id;
        
        // patient model ID might be different from user ID
        const Patient = require('../models/Patient');
        const patProfile = await Patient.findOne({ user: patId });

        console.log("\n## Real Issuance Test");
        // Issue certificate
        const dummyHash = ethers.hexlify(ethers.randomBytes(32)); 
        console.log(`Generated publicCommitmentHash: ${dummyHash}`);

        const issueRes = await axios.post(`${API_BASE}/certificates`, {
            patientId: patProfile._id,
            diagnosis: "Test Diagnosis",
            publicCommitmentHash: dummyHash,
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000).toISOString(),
            remarks: "STEP40C REVOCATION TEST"
        }, {
            headers: { Authorization: `Bearer ${docToken}` }
        });

        const certId = issueRes.data.data._id;
        const txHash = issueRes.data.data.blockchainTxHash;
        console.log(`Certificate ID: ${certId}`);
        console.log(`Transaction Hash: ${txHash}`);
        
        if (!txHash) throw new Error("No real transaction hash returned!");
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) throw new Error("Transaction not found on Ganache!");
        console.log(`Transaction Block: ${receipt.blockNumber}`);
        console.log(`Transaction Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`Transaction Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);

        // Check on-chain exists
        const [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(dummyHash);
        console.log(`\n## On-Chain Pre-Revocation State`);
        console.log(`exists: ${exists}`);
        console.log(`revoked: ${revoked}`);

        // Revocation Test
        console.log("\n## Real Revocation Test");
        const revokeRes = await axios.put(`${API_BASE}/certificates/${certId}/revoke`, {
            reason: "STEP40C REVOCATION TEST"
        }, {
            headers: { Authorization: `Bearer ${docToken}` }
        });

        console.log(`Revoke API response status: ${revokeRes.status}`);
        
        const filter = registry.filters.CertificateRevoked(dummyHash);
        const events = await registry.queryFilter(filter, receipt.blockNumber);
        if (events.length > 0) {
            console.log(`Revocation Transaction Hash: ${events[0].transactionHash}`);
            console.log(`Revocation Block: ${events[0].blockNumber}`);
        } else {
            console.log(`No CertificateRevoked event found!`);
        }

        // Check on-chain revoked
        const [issuer2, issuedAt2, revoked2, exists2] = await registry.getCertificateRecord(dummyHash);
        console.log(`\n## On-Chain Post-Revocation State`);
        console.log(`exists: ${exists2}`);
        console.log(`revoked: ${revoked2}`);

        // Check MongoDB revoked
        const Certificate = require('../models/Certificate');
        const dbCert = await Certificate.findById(certId);
        console.log(`\n## MongoDB State`);
        console.log(`status: ${dbCert.status}`);
        console.log(`revokedAt: ${dbCert.revokedAt}`);
        console.log(`revokeReason: ${dbCert.revokeReason}`);

        // Check Audit Log
        const AuditLog = require('../models/AuditLog');
        const logs = await AuditLog.find({ resourceId: certId, action: 'CERTIFICATE_REVOKED' });
        console.log(`\n## Audit Log`);
        if (logs.length > 0) {
            console.log(`Found revocation audit log: PASS`);
        } else {
            console.log(`NOT IMPLEMENTED / FAIL`);
        }

        // Patient UI check
        const patCerts = await axios.get(`${API_BASE}/certificates`, {
            headers: { Authorization: `Bearer ${patToken}` }
        });
        const patCert = patCerts.data.data.find(c => c._id.toString() === certId);
        console.log(`\n## Patient UI`);
        console.log(`Patient sees status: ${patCert ? patCert.status : 'NOT FOUND'}`);

        // Double revoke
        console.log(`\n## Already Revoked`);
        try {
            await axios.put(`${API_BASE}/certificates/${certId}/revoke`, {
                reason: "Second attempt"
            }, {
                headers: { Authorization: `Bearer ${docToken}` }
            });
            console.log(`Second revoke attempt: FAILED (Did not throw 409)`);
        } catch (e) {
            console.log(`Second revoke attempt result: ${e.response?.status} - ${e.response?.data?.message}`);
        }

        // Patient attempt
        console.log(`\n## Patient Attempt`);
        try {
            await axios.put(`${API_BASE}/certificates/${certId}/revoke`, {
                reason: "Patient attempt"
            }, {
                headers: { Authorization: `Bearer ${patToken}` }
            });
            console.log(`Patient revoke attempt: FAILED (Did not throw 403)`);
        } catch (e) {
            console.log(`Patient revoke attempt result: ${e.response?.status} - ${e.response?.data?.message}`);
        }
        
        // Unauthenticated
        console.log(`\n## Unauthenticated`);
        try {
            await axios.put(`${API_BASE}/certificates/${certId}/revoke`, {
                reason: "Unauthenticated attempt"
            });
            console.log(`Unauthenticated revoke attempt: FAILED`);
        } catch (e) {
            console.log(`Unauthenticated revoke attempt result: ${e.response?.status} - ${e.response?.data?.message}`);
        }

        console.log("\nDone.");
        process.exit(0);

    } catch (e) {
        console.error("Test Failed:", e.message || e.response?.data || e);
        process.exit(1);
    }
}

run();
