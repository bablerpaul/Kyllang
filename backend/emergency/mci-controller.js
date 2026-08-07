// KYLLANG_V4: Emergency / MCI Controller
// Handles break-glass operations during Mass Casualty Incidents (MCI).
// Bypasses patient approval requirements but logs everything immutably.
// Fixes Flaw 6: lack of break-glass access.
// UPDATE: Now uses Multi-Sig.

const { getContract } = require('../blockchain');
const User = require('../models/User');

/**
 * Submits an approval for Mass Casualty Incident (MCI) mode on-chain.
 * Requires board member privileges.
 */
exports.activateMCI = async (req, res, next) => {
    try {
        const contract = getContract('EmergencyEscrow');
        if (!contract) {
            return res.status(500).json({ success: false, message: 'EmergencyEscrow contract not available' });
        }

        const tx = await contract.approveMCI();
        await tx.wait();

        const currentApprovals = await contract.mciApprovalCount();
        const threshold = await contract.THRESHOLD();

        res.status(200).json({ 
            success: true, 
            message: `MCI approval submitted. Approvals: ${currentApprovals}/${threshold}.`, 
            data: { txHash: tx.hash, currentApprovals: currentApprovals.toString(), threshold: threshold.toString() } 
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Deactivates Mass Casualty Incident (MCI) mode on-chain immediately (Admin override).
 * Requires admin privileges.
 */
exports.deactivateMCI = async (req, res, next) => {
    try {
        const contract = getContract('EmergencyEscrow');
        if (!contract) {
            return res.status(500).json({ success: false, message: 'EmergencyEscrow contract not available' });
        }

        const tx = await contract.deactivateMCI();
        await tx.wait();

        res.status(200).json({ success: true, message: 'MCI mode deactivated.', data: { txHash: tx.hash } });
    } catch (error) {
        next(error);
    }
};

/**
 * Gets the current MCI status from the chain.
 */
exports.getMCIStatus = async (req, res, next) => {
    try {
        const contract = getContract('EmergencyEscrow');
        if (!contract) {
            return res.status(500).json({ success: false, message: 'EmergencyEscrow contract not available' });
        }

        const mciExpiresAt = await contract.mciExpiresAt();
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const mciActive = currentTimestamp <= Number(mciExpiresAt);

        res.status(200).json({ success: true, data: { mciActive, mciExpiresAt: mciExpiresAt.toString() } });
    } catch (error) {
        next(error);
    }
};
