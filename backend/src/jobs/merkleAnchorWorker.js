// KYLLANG_V4: Merkle anchor worker — batches audit log hashes every 10 minutes,
// builds a Merkle root, and posts it on-chain. Fixes the silent-corruption window
// between log writes and blockchain anchoring.

const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

/**
 * Builds a Merkle root from an array of hex hash strings.
 * Duplicates the last element if the layer has odd length.
 * @param {string[]} hashes - Array of hex hash strings
 * @returns {string|null} Merkle root hex string, or null if empty
 */
function buildMerkleRoot(hashes) {
  if (hashes.length === 0) return null;
  let layer = [...hashes];
  while (layer.length > 1) {
    if (layer.length % 2 !== 0) layer.push(layer[layer.length - 1]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(crypto.createHash('sha256').update(layer[i] + layer[i + 1]).digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}

if (!isMainThread) {
    // Worker Thread Logic: offloaded from event loop
    const root = buildMerkleRoot(workerData);
    parentPort.postMessage(root);
} else {
    // Main Thread Logic
    const AuditLog = require('../../models/AuditLog');
    
    function runMerkleWorker(hashes) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, { workerData: hashes });
            worker.on('message', resolve);
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
            });
        });
    }

    /**
     * Processes a batch of unanchored audit logs:
     * 1. Collects chainHash values from up to 500 unanchored entries
     * 2. Builds a Merkle root (via worker_thread)
     * 3. Posts the root on-chain via blockchainContract.storeHash()
     * 4. Marks all entries as blockchainAnchored with tx details
     */
    async function anchorBatch(blockchainContract) {
      const unanchored = await AuditLog.find({ blockchainAnchored: false }).limit(500).lean();
      if (unanchored.length === 0) return;

      const hashes = unanchored.map(l => l.chainHash || l._id.toString());
      
      // Offload cryptographic hashing to worker thread
      let merkleRoot;
      try {
          merkleRoot = await runMerkleWorker(hashes);
      } catch (err) {
          console.error('[MerkleAnchor] Worker error:', err.message);
          return;
      }
      
      const ids = unanchored.map(l => l._id);

      try {
        const tx = await blockchainContract.storeHash(merkleRoot);
        await tx.wait();
        await AuditLog.updateMany({ _id: { $in: ids } }, {
          $set: { blockchainAnchored: true, anchorTxHash: tx.hash, anchorMerkleRoot: merkleRoot }
        });
        console.log(`[MerkleAnchor] Anchored ${ids.length} entries. Root: ${merkleRoot}`);
      } catch (err) {
        console.error('[MerkleAnchor] Anchor failed:', err.message);
      }
    }

    let interval = null;

    /**
     * Starts the Merkle anchor background worker.
     * In production: runs every 10 minutes.
     * In test mode: runs every 2 seconds for rapid validation.
     * @param {Object} blockchainContract - Ethers.js contract instance with storeHash()
     */
    function startMerkleAnchorWorker(blockchainContract) {
      const ms = process.env.NODE_ENV === 'test' ? 2000 : 10 * 60 * 1000;
      interval = setInterval(() => anchorBatch(blockchainContract), ms);
      console.log(`[MerkleAnchor] Worker started (interval: ${ms}ms)`);
    }

    function stopMerkleAnchorWorker() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    module.exports = { startMerkleAnchorWorker, stopMerkleAnchorWorker, buildMerkleRoot };
}
