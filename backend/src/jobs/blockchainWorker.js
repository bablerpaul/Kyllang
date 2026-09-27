const mongoose = require('mongoose');
const FileVersion = require('../modules/secure-storage/models/FileVersion');
const blockchainContract = require('../../blockchain');
const SecureFile = require('../modules/secure-storage/models/SecureFile');

const MAX_RETRIES = 3;
const POLL_INTERVAL = 10000; // 10 seconds

async function processPendingTransactions() {
    try {
        // Find one pending transaction and lock it atomically
        const pendingVersion = await FileVersion.findOneAndUpdate(
            { blockchainStatus: 'pending' },
            { $set: { blockchainStatus: 'processing' } },
            { new: true, sort: { createdAt: 1 } }
        );

        if (!pendingVersion) return; // Queue is empty

        console.log(`[Blockchain Queue] Processing FileVersion: ${pendingVersion._id}`);

        const secureFile = await SecureFile.findById(pendingVersion.secureFile);
        if (!secureFile) throw new Error('Associated SecureFile not found');

        if (blockchainContract && blockchainContract.commitHash && blockchainContract.revealHash) {
            const crypto = require('crypto');
            const { ethers } = require('ethers');
            
            // 1. Generate cryptographically secure nonce
            const nonceBuffer = crypto.randomBytes(32);
            const nonce = '0x' + nonceBuffer.toString('hex');

            // 2. Calculate commitment matching Solidity: keccak256(abi.encodePacked(keccak256(abi.encodePacked(dataHash)), nonce, msg.sender))
            const innerHash = ethers.solidityPackedKeccak256(['string'], [pendingVersion.dataHash]);

            // Determine backend signer address
            let signerAddress = '0x0000000000000000000000000000000000000000';
            if (blockchainContract.runner && typeof blockchainContract.runner.getAddress === 'function') {
                signerAddress = await blockchainContract.runner.getAddress();
            } else if (blockchainContract.signer && typeof blockchainContract.signer.getAddress === 'function') {
                signerAddress = await blockchainContract.signer.getAddress();
            }

            const commitment = ethers.solidityPackedKeccak256(
                ['bytes32', 'bytes32', 'address'],
                [innerHash, nonce, signerAddress]
            );

            // 3. Commit transaction
            let currentNonce;
            if (blockchainContract.runner && typeof blockchainContract.runner.getNonce === 'function') {
                currentNonce = await blockchainContract.runner.getNonce('latest');
            } else if (blockchainContract.signer && typeof blockchainContract.signer.getNonce === 'function') {
                currentNonce = await blockchainContract.signer.getNonce('latest');
            } else {
                currentNonce = await blockchainContract.provider.getTransactionCount(signerAddress, 'latest');
            }

            const commitTx = await blockchainContract.commitHash(commitment, { nonce: currentNonce });
            await commitTx.wait(); // Wait for transaction to be mined

            // 4. Reveal transaction
            const revealTx = await blockchainContract.revealHash(
                secureFile.patient.toString(),
                pendingVersion.recordTypeStr || secureFile.fileType || '',
                pendingVersion.dataHash,
                pendingVersion.ipfsCid || '',
                nonce,
                { nonce: currentNonce + 1 }
            );
            await revealTx.wait(); // Wait for transaction to be mined
            
            // Update on success
            await FileVersion.updateOne(
                { _id: pendingVersion._id },
                { 
                    $set: { 
                        blockchainTransactionHash: revealTx.hash,
                        blockchainStatus: 'confirmed' 
                    } 
                }
            );
            console.log(`[Blockchain Queue] Successfully anchored via Commit-Reveal: ${revealTx.hash}`);
        } else {
            throw new Error('Blockchain contract not initialized or missing commit/reveal functions');
        }

    } catch (error) {
        console.error('[Blockchain Queue] Error processing transaction:', error.message);
        
        // Find the record that was processing to handle retry logic
        const failedVersion = await FileVersion.findOneAndUpdate(
            { blockchainStatus: 'processing' },
            { $inc: { blockchainRetries: 1 } },
            { new: true }
        );

        if (failedVersion) {
            if (failedVersion.blockchainRetries >= MAX_RETRIES) {
                await FileVersion.updateOne(
                    { _id: failedVersion._id },
                    { $set: { blockchainStatus: 'failed' } }
                );
                console.error(`[Blockchain Queue] Max retries reached for ${failedVersion._id}. Marked as failed.`);
            } else {
                await FileVersion.updateOne(
                    { _id: failedVersion._id },
                    { $set: { blockchainStatus: 'pending' } }
                );
                console.log(`[Blockchain Queue] Requeued for retry (${failedVersion.blockchainRetries}/${MAX_RETRIES})`);
            }
        }
    }
}

let workerInterval = null;

function startBlockchainWorker() {
    if (workerInterval) return;
    if (process.env.TEST_MODE === 'true') {
        console.log('[Blockchain Queue] Test mode detected. Polling frequently.');
        workerInterval = setInterval(processPendingTransactions, 1000); // Poll fast for tests
    } else {
        console.log('[Blockchain Queue] Worker started. Polling every 10 seconds.');
        workerInterval = setInterval(processPendingTransactions, POLL_INTERVAL);
    }
    processPendingTransactions(); // Run once immediately
}

function stopBlockchainWorker() {
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
        console.log('[Blockchain Queue] Worker stopped.');
    }
}

module.exports = { startBlockchainWorker, stopBlockchainWorker };
