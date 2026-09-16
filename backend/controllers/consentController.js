const crypto = require('crypto');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Consent = require('../models/Consent');
const AuditLog = require('../models/AuditLog');
const blockchain = require('../blockchain');

/**
 * Grant new granular consent
 */
exports.grantConsent = async (req, res, next) => {
    try {
        const { grantedTo, scope, recordType, recordId, purpose, durationDays, durationHours, doctorEncryptedKeys } = req.body;

        if (!grantedTo || !scope || !purpose || (!durationDays && !durationHours)) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const expiresAt = new Date();
        if (durationHours) {
            expiresAt.setHours(expiresAt.getHours() + parseInt(durationHours));
        } else if (durationDays) {
            expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));
        }

        // Create the MongoDB record
        const consent = await Consent.create({
            patient: req.user._id,
            grantedTo,
            scope,
            recordType,
            recordId: recordId || undefined,
            purpose,
            expiresAt,
            doctorEncryptedKeys: doctorEncryptedKeys || {},
            status: 'active'
        });

        const crypto = require('crypto');
        const patientSalt = crypto.randomBytes(32).toString('hex');
        consent.patientSalt = patientSalt;
        
        const patientCommitment = ethers.solidityPackedKeccak256(
            ['string', 'string'],
            [req.user._id.toString(), patientSalt]
        );

        const consentIdHex = ethers.keccak256(ethers.toUtf8Bytes(consent._id.toString()));

        let txHash = null;
        try {
            const contract = blockchain.getContract('ConsentRegistry');
            if (contract && (process.env.NODE_ENV === 'production' || process.env.TEST_MODE === 'true')) {
                const tx = await contract.grantConsent(
                    consentIdHex,
                    patientCommitment,
                    grantedTo.toString(),
                    scope,
                    recordId ? recordId.toString() : "",
                    purpose,
                    Math.floor(expiresAt.getTime() / 1000)
                );
                await tx.wait();
                txHash = tx.hash;
            }
        } catch (e) {
            console.error('Failed to anchor consent on-chain:', e.message);
        }

        consent.blockchainTxHash = txHash;
        await consent.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'GRANT_CONSENT',
            details: { consentId: consent._id, grantedTo, scope, purpose, txHash }
        });

        res.status(201).json({ success: true, message: 'Consent granted successfully', data: consent });
    } catch (error) {
        next(error);
    }
};

/**
 * Revoke active consent
 */
exports.revokeConsent = async (req, res, next) => {
    try {
        const { consentId } = req.params;

        const consent = await Consent.findOne({ _id: consentId, patient: req.user._id });
        if (!consent) {
            return res.status(404).json({ success: false, message: 'Consent not found or unauthorized' });
        }

        if (consent.status === 'revoked') {
            return res.status(400).json({ success: false, message: 'Consent is already revoked' });
        }

        consent.status = 'revoked';

        const consentIdHex = ethers.keccak256(ethers.toUtf8Bytes(consent._id.toString()));
        let txHash = null;

        try {
            const contract = blockchain.getContract('ConsentRegistry');
            if (contract && (process.env.NODE_ENV === 'production' || process.env.TEST_MODE === 'true')) {
                const tx = await contract.revokeConsent(consentIdHex);
                await tx.wait();
                txHash = tx.hash;
            }
        } catch (e) {
            console.error('Failed to revoke consent on-chain:', e.message);
        }

        await consent.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'REVOKE_CONSENT',
            details: { consentId: consent._id, txHash }
        });

        res.status(200).json({ success: true, message: 'Consent revoked successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Get active consents for the logged-in patient
 */
exports.getMyConsents = async (req, res, next) => {
    try {
        const consents = await Consent.find({ patient: req.user._id })
            .populate('grantedTo', 'name email role')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, data: consents });
    } catch (error) {
        next(error);
    }
};
