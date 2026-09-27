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
        let records = [];
        if (mongoose.Types.ObjectId.isValid(patientId)) {
            // Instantly bypass constraints and fetch the patient's full history, newest first
            records = await MedicalRecord.find({ patient: patientId })
                .sort({ visitDate: -1 })
                .populate('patient', 'name email')
                .lean();
        }

        if (records.length === 0) {
            // Log the failed/not-found break-glass attempt to prevent silent enumeration
            await AuditLog.create({
                actor: req.user._id,
                action: 'BREAK_GLASS_FAILED',
                details: {
                    message: 'Emergency Break-Glass protocol failed: Record not found',
                    patientId: patientId,
                    timestamp: new Date()
                }
            });
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
        let breakGlassTxHash = null;
        try {
            const contract = getContract('BreakGlassRegistry');
            if (contract && (process.env.NODE_ENV === 'production' || process.env.TEST_MODE === 'true')) {
                const { ethers } = require('ethers');
                let formattedPatientId = patientId.toString();
                if (formattedPatientId.length > 31) formattedPatientId = formattedPatientId.substring(0, 31);
                const patientIdBytes32 = ethers.encodeBytes32String(formattedPatientId);
                const rawReason = req.body.reason || 'Emergency Override';
                const safeReason = rawReason.substring(0, 1000); // Bounded length
                const ticketHash = ethers.id(safeReason);
                
                const operatorIdentity = req.user._id.toString();
                
                const tx = await contract.declareEmergency(patientIdBytes32, ticketHash, operatorIdentity);
                await tx.wait();
                breakGlassTxHash = tx.hash;
                console.log('[BreakGlassRegistry] Emergency declared on-chain. TX:', breakGlassTxHash);
            }
        } catch (err) {
            console.warn('Failed to interact with BreakGlassRegistry contract for on-chain audit:', err.message);
        }

        res.status(200).json({
            success: true,
            message: 'Break-glass protocol activated. Critical audit logged.',
            data: { ...records[0], history: records, breakGlassTxHash }
        });
    } catch (error) {
        next(error);
    }
};
