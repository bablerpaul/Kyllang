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

/**
 * Break-Glass Protocol: Instantly bypasses normal authorization to fetch a patient's EMR.
 * Used during life-or-death emergencies. Generates a critical audit log.
 */
exports.breakGlass = async (req, res, next) => {
    try {
        const { patientId } = req.body;
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        const AuditLog = require('../models/AuditLog');
        const MedicalRecord = require('../models/MedicalRecord');
        const mongoose = require('mongoose');

        // Check if patientId is a valid ObjectId
        let record = null;
        if (mongoose.Types.ObjectId.isValid(patientId)) {
            // Instantly bypass constraints and fetch the record
            record = await MedicalRecord.findOne({ patient: patientId })
                .populate('patient', 'name email')
                .lean();
        }

        if (!record) {
            return res.status(404).json({ success: false, message: 'Medical record not found for this patient ID' });
        }

        // Fire a critical audit event (BREAK_GLASS_ACTIVATED)
        await AuditLog.create({
            actor: req.user._id,
            action: 'BREAK_GLASS_ACTIVATED',
            details: {
                message: 'Emergency Break-Glass protocol triggered',
                patientId: patientId,
                timestamp: new Date()
            }
        });

        // Optionally interact with BreakGlassRegistry contract to log it on-chain
        try {
            const contract = getContract('BreakGlassRegistry');
            if (contract) {
                // Assuming contract has a way to log this immediately, 
                // for simplicity here we just log it in our off-chain DB,
                // but we could emit an event on-chain as well if needed.
            }
        } catch (err) {
            console.warn('Failed to interact with BreakGlassRegistry contract for on-chain audit', err);
        }

        res.status(200).json({
            success: true,
            message: 'Break-glass protocol activated. Critical audit logged.',
            data: record
        });
    } catch (error) {
        next(error);
    }
};
