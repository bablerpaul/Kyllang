const { ethers } = require('ethers');

/**
 * Service to orchestrate authorized updates to the Sentinel Registry
 * when a legitimate certificate is created or revoked.
 */
class RootSyncService {
    constructor(dbSimulator, registryContract, signersWallets) {
        this.db = dbSimulator;
        this.registry = registryContract;
        
        // Multi-Sig Signers available to this backend
        // In a real system, the backend might only have 1 hot wallet and must request
        // signatures from an external HSM (Hospital Security Officer) and Auditor.
        // For testing, we provide them here.
        this.signers = signersWallets; 
    }

    /**
     * Compute the expected root over the current database state
     */
    async computeExpectedStateRoot() {
        const records = await this.db.fetchRecordsLinearizable();
        records.sort((a, b) => a.id.localeCompare(b.id));
        
        let stateString = "";
        for (const record of records) {
            stateString += JSON.stringify(record);
        }
        return ethers.keccak256(ethers.toUtf8Bytes(stateString));
    }

    /**
     * Simulates a legitimate write to the DB and syncs it on-chain
     */
    async commitLegitimateWrite(newRecord) {
        // 1. Write to DB
        await this.db.insertRecord(newRecord);
        console.log(`[RootSync] Legitimate record inserted: ${newRecord.id}`);

        // 2. Compute New Root and Sequence
        const newRoot = await this.computeExpectedStateRoot();
        const currentSequence = await this.registry.stateSequence();
        const newSequence = currentSequence + 1n;

        console.log(`[RootSync] New Root Computed: ${newRoot}. Requesting signatures for Sequence ${newSequence}...`);

        // 3. Gather 2-of-3 Multi-Sig Signatures
        // Message Hash: H(newRoot || newSequence || chainId || contractAddress)
        const chainId = (await this.registry.runner.provider.getNetwork()).chainId;
        const registryAddress = await this.registry.getAddress();

        const messageHash = ethers.solidityPackedKeccak256(
            ['bytes32', 'uint256', 'uint256', 'address'],
            [newRoot, newSequence, chainId, registryAddress]
        );

        // Sign with exactly 2 authorized signers
        const sig1 = await this.signers[0].signMessage(ethers.getBytes(messageHash));
        const sig2 = await this.signers[1].signMessage(ethers.getBytes(messageHash));
        
        // Ensure sorted order for the smart contract verification
        const addr1 = ethers.verifyMessage(ethers.getBytes(messageHash), sig1);
        const addr2 = ethers.verifyMessage(ethers.getBytes(messageHash), sig2);

        let signatures = [sig1, sig2];
        if (BigInt(addr1) > BigInt(addr2)) {
            signatures = [sig2, sig1]; // Swap to maintain strict ascending order
        }

        // 4. Submit to Registry
        console.log(`[RootSync] Signatures collected. Submitting to Blockchain...`);
        // The sender can be any wallet paying gas, but usually it's a relayer or the hot wallet
        const tx = await this.registry.updateApprovedRoot(newRoot, newSequence, signatures);
        await tx.wait();

        console.log(`[RootSync] ✅ Approved Root successfully updated on-chain!`);
        return newRoot;
    }
}

module.exports = RootSyncService;
