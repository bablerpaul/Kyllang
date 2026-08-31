const { ethers } = require('ethers');
const crypto = require('crypto');

class SentinelWorker {
    constructor(dbSimulator, registryContract, pollingIntervalMs = 60000) {
        this.db = dbSimulator;
        this.registry = registryContract;
        this.pollingIntervalMs = pollingIntervalMs;
        this.intervalId = null;
        this.isRunning = false;
        
        // Anti-flap threshold
        this.consecutiveMismatches = 0;
        this.MISMATCH_THRESHOLD = 2; // Hard freeze after 2 consecutive mismatches
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.intervalId = setInterval(() => this.sweepAndDispatch(), this.pollingIntervalMs);
        console.log(`[Sentinel] Started. Polling every ${this.pollingIntervalMs}ms`);
        // Do first sweep immediately
        this.sweepAndDispatch();
    }

    stop() {
        if (!this.isRunning) return;
        clearInterval(this.intervalId);
        this.isRunning = false;
        console.log("[Sentinel] Stopped.");
    }

    /**
     * Simulates reading all active certificates from MongoDB with linearizable read concern
     * and building a Merkle root over them.
     */
    async computeStateRoot() {
        // Linearizable read simulation
        const records = await this.db.fetchRecordsLinearizable();
        
        // Canonical serialization & hashing (sort by ID for deterministic order)
        records.sort((a, b) => a.id.localeCompare(b.id));
        
        let stateString = "";
        for (const record of records) {
            stateString += JSON.stringify(record);
        }

        // Simple Merkle Hash of the entire dataset (In production, use SMT)
        const rootHash = ethers.keccak256(ethers.toUtf8Bytes(stateString));
        return rootHash;
    }

    async sweepAndDispatch() {
        console.log("[Sentinel] Initiating Database Sweep...");

        try {
            const computedRoot = await this.computeStateRoot();
            
            // Fetch on-chain trusted state
            const lastKnownGoodRoot = await this.registry.lastKnownGoodRoot();
            const stateSequence = await this.registry.stateSequence();
            
            if (computedRoot === lastKnownGoodRoot) {
                console.log(`[Sentinel] Root match verified (${computedRoot}). Submitting Heartbeat (Seq: ${stateSequence})...`);
                this.consecutiveMismatches = 0;
                
                // Submit heartbeat
                const tx = await this.registry.submitHeartbeat(computedRoot, stateSequence);
                await tx.wait();
                console.log(`[Sentinel] Heartbeat submitted successfully.`);
            } else {
                this.consecutiveMismatches++;
                console.warn(`[Sentinel] ⚠️ ROOT MISMATCH DETECTED (Attempt ${this.consecutiveMismatches}/${this.MISMATCH_THRESHOLD})`);
                console.warn(`  Expected (On-Chain): ${lastKnownGoodRoot}`);
                console.warn(`  Observed (Database): ${computedRoot}`);

                if (this.consecutiveMismatches >= this.MISMATCH_THRESHOLD) {
                    console.error("[Sentinel] 🚨 THRESHOLD REACHED. TRIGGERING AUTONOMOUS EMERGENCY LOCKDOWN 🚨");
                    
                    const proof = ethers.toUtf8Bytes("Mismatch_Proof_Dump");
                    const tx = await this.registry.triggerEmergencyLockdown(computedRoot, proof);
                    await tx.wait();
                    console.error("[Sentinel] Lockdown transaction confirmed. Break-Glass operations frozen.");
                    
                    
                    // Stop sweeping once locked down
                    if (this.intervalId) clearInterval(this.intervalId);
                } else {
                    console.log("[Sentinel] Scheduled anti-flap verification...");
                }
            }
        } catch (err) {
            console.error("[Sentinel] Sweep/Dispatch error:", err.message);
        }
    }
}

module.exports = SentinelWorker;
