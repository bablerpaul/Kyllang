const { ethers } = require('ethers');

class AuditRelayer {
    /**
     * Initializes the Audit Relayer queue.
     * @param {ethers.Wallet} relayerWallet The dedicated wallet for submitting audits
     * @param {ethers.Contract} registryContract The EmergencyAuditRegistry contract instance
     */
    constructor(relayerWallet, registryContract) {
        this.wallet = relayerWallet;
        this.registry = registryContract;
        this.queue = [];
        this.isProcessing = false;
        
        // Multi-RPC failover simulation (we use the wallet's provider, but could array them here)
        this.providers = [relayerWallet.provider];
    }

    /**
     * Push a new audit commitment bundle to the relayer queue.
     * Non-blocking - returns immediately so the doctor's process is not delayed.
     */
    async enqueueAudit(auditPayload) {
        this.queue.push({
            ...auditPayload,
            retries: 0,
            addedAt: Date.now()
        });
        
        console.log(`[AuditRelayer] Queued audit commitment for async anchoring. Queue size: ${this.queue.length}`);
        
        if (!this.isProcessing) {
            this.processQueue(); // Kick off processing without awaiting
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const currentTask = this.queue[0];

        try {
            console.log(`[AuditRelayer] Processing audit commitment (Retries: ${currentTask.retries})...`);
            
            // Execute on-chain transaction
            const tx = await this.registry.recordEmergencyAudit(
                currentTask.sessionNonce,
                currentTask.commitmentHash,
                currentTask.doctorSig,
                currentTask.custodianSig,
                currentTask.enclaveSig
            );

            console.log(`[AuditRelayer] Transaction submitted (TxHash: ${tx.hash}). Waiting for confirmation...`);
            const receipt = await tx.wait();
            
            console.log(`[AuditRelayer] ✅ Audit successfully anchored at block ${receipt.blockNumber}.`);
            
            // Task successful, remove from queue
            this.queue.shift();
            
            // Process next
            setImmediate(() => this.processQueue());

        } catch (error) {
            console.error(`[AuditRelayer] ❌ Transaction failed:`, error.message);
            
            currentTask.retries++;
            if (currentTask.retries < 5) {
                // Exponential backoff
                const backoffMs = Math.pow(2, currentTask.retries) * 1000;
                console.log(`[AuditRelayer] Retrying in ${backoffMs}ms...`);
                setTimeout(() => this.processQueue(), backoffMs);
            } else {
                console.error(`[AuditRelayer] 🚨 CRITICAL: Audit payload permanently dropped after 5 retries!`);
                // Move to dead-letter queue (in a real system)
                this.queue.shift();
                setImmediate(() => this.processQueue());
            }
        }
    }
}

module.exports = AuditRelayer;
