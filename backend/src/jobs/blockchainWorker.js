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

        if (blockchainContract && blockchainContract.storeEMRRecord) {
            const tx = await blockchainContract.storeEMRRecord(
                secureFile.patient.toString(),
                pendingVersion.recordTypeStr || secureFile.fileType,
                pendingVersion.dataHash,
                pendingVersion.ipfsCid
            );
            
            await tx.wait(); // Wait for transaction to be mined
            
            // Update on success
            await FileVersion.updateOne(
                { _id: pendingVersion._id },
                { 
                    $set: { 
                        blockchainTransactionHash: tx.hash,
                        blockchainStatus: 'confirmed' 
                    } 
                }
            );
            console.log(`[Blockchain Queue] Successfully anchored: ${tx.hash}`);
        } else {
            throw new Error('Blockchain contract not initialized');
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
