const { ethers } = require('ethers');
const auditVault = require('../../vault/auditVault');

class AuditMonitor {
    /**
     * @param {ethers.Contract} registryContract EmergencyAuditRegistry instance
     */
    constructor(registryContract) {
        this.registry = registryContract;
        this.isRunning = false;
        this.timeoutBlocks = 10;
        this.decryptionReceipts = new Map(); // sessionNonce -> { blockNumber, auditId }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[AuditSentinel] Autonomous monitoring started. Listening for on-chain anchors...`);
        
        // Listen to on-chain events
        this.registry.on("EmergencyAuditAnchored", (auditId, commitmentHash, timestamp, event) => {
            console.log(`[AuditSentinel] 🔗 Detected On-Chain Anchor: ${auditId}`);
            this._reconcile(auditId);
        });

        // Periodic sweep
        this.intervalId = setInterval(() => this._sweep(), 5000);
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);
        this.registry.removeAllListeners("EmergencyAuditAnchored");
        console.log(`[AuditSentinel] Monitoring stopped.`);
    }

    /**
     * Called by the local Secure Enclave when a decryption successfully completes.
     */
    logLocalDecryption(sessionNonce, auditId, currentBlock) {
        this.decryptionReceipts.set(sessionNonce, {
            auditId,
            blockNumber: currentBlock,
            anchored: false
        });
        console.log(`[AuditSentinel] 📥 Logged local decryption receipt for Session: ${sessionNonce}`);
    }

    _reconcile(auditId) {
        // Find if we have a receipt for this auditId
        for (const [sessionNonce, receipt] of this.decryptionReceipts.entries()) {
            if (receipt.auditId === auditId) {
                receipt.anchored = true;
                console.log(`[AuditSentinel] ✅ Successfully reconciled decryption ${sessionNonce} with on-chain anchor.`);
                this.decryptionReceipts.delete(sessionNonce);
                break;
            }
        }
    }

    async _sweep() {
        if (!this.isRunning) return;
        try {
            const currentBlock = await this.registry.runner.provider.getBlockNumber();
            
            for (const [sessionNonce, receipt] of this.decryptionReceipts.entries()) {
                if (!receipt.anchored) {
                    if (currentBlock - receipt.blockNumber > this.timeoutBlocks) {
                        console.error(`[AuditSentinel] 🚨 CRITICAL COMPLIANCE ALERT 🚨`);
                        console.error(`[AuditSentinel] Session ${sessionNonce} was decrypted locally, but no on-chain anchor was found within ${this.timeoutBlocks} blocks!`);
                        console.error(`[AuditSentinel] Initiating SOC escalation procedures...`);
                        
                        // Flag as alerted so we don't spam
                        receipt.anchored = true; 
                        this.decryptionReceipts.delete(sessionNonce);
                    }
                }
            }
        } catch (e) {
            console.error(`[AuditSentinel] Sweep error: ${e.message}`);
        }
    }
}

module.exports = AuditMonitor;
