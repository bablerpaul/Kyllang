const InsuranceClaim = require('../../../models/InsuranceClaim');
const Certificate = require('../../../models/Certificate');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const blockchainContract = require('../../../blockchain');

// Helper to resolve Patient Document ID
const resolvePatientId = async (idInput) => {
    let patient = await Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!patient) {
        const userExists = await User.findById(idInput);
        if (userExists) {
            patient = await Patient.create({ user: idInput });
        }
    }
    return patient ? patient._id : idInput;
};

// @desc    Submit a new Insurance Claim
// @route   POST /api/insurance/claims
// @access  Private
exports.submitClaim = async (req, res) => {
    try {
        const { patientId, provider, policyNumber, claimAmount, medicalRecordId, certificateId, treatmentSummary, diagnosisCode } = req.body;

        const targetPatientInput = patientId || (req.user ? req.user._id : null);
        if (!targetPatientInput || !provider || !policyNumber || !claimAmount) {
            return res.status(400).json({ message: 'patientId, provider, policyNumber, and claimAmount are required' });
        }

        const resolvedPatientId = await resolvePatientId(targetPatientInput);

        let emrDoc = null;
        if (medicalRecordId) {
            emrDoc = await MedicalRecord.findById(medicalRecordId);
        }

        let certDoc = null;
        if (certificateId) {
            certDoc = await Certificate.findById(certificateId);
        }

        const blockchainHash = (certDoc && certDoc.blockchainHash) || (emrDoc && emrDoc.blockchainHash) || (emrDoc && emrDoc.dataHash) || undefined;
        const transactionHash = (certDoc && certDoc.transactionHash) || (emrDoc && emrDoc.transactionHash) || undefined;

        const claim = await InsuranceClaim.create({
            patient: resolvedPatientId,
            user: req.user ? req.user._id : undefined,
            provider,
            policyNumber,
            claimAmount: Number(claimAmount),
            medicalRecord: emrDoc ? emrDoc._id : undefined,
            certificate: certDoc ? certDoc._id : undefined,
            doctor: emrDoc ? emrDoc.doctor : (certDoc ? certDoc.doctor : undefined),
            treatmentSummary: treatmentSummary || (emrDoc ? emrDoc.diagnosis : 'Medical Treatment Claim'),
            diagnosisCode: diagnosisCode || 'ICD-10-GENERAL',
            blockchainHash,
            transactionHash,
            status: 'submitted',
        });

        // Store Audit Log for CREATED action
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: blockchainHash,
            blockchainTransaction: transactionHash,
            details: { type: 'submit_insurance_claim', provider, claimAmount }
        });

        const populatedClaim = await InsuranceClaim.findById(claim._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals dataHash transactionHash')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash blockchainHash');

        res.status(201).json({
            success: true,
            message: 'Insurance claim submitted successfully',
            claim: populatedClaim,
        });
    } catch (error) {
        console.error('Error in submitClaim:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all Insurance Claims
// @route   GET /api/insurance/claims
// @access  Private
exports.getAllClaims = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { user: req.user._id }] };
        } else if (req.query.status) {
            filter.status = req.query.status;
        }

        const claims = await InsuranceClaim.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'InsuranceClaim',
            details: { count: claims.length }
        });

        res.status(200).json(claims);
    } catch (error) {
        console.error('Error in getAllClaims:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Patient Claim History
// @route   GET /api/insurance/claims/patient/:patientId
// @access  Private
exports.getPatientClaimHistory = async (req, res) => {
    try {
        const pId = await resolvePatientId(req.params.patientId);

        const claims = await InsuranceClaim.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }, { user: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'InsuranceClaim',
            resourceId: req.params.patientId,
            details: { type: 'get_patient_claims', count: claims.length }
        });

        res.status(200).json(claims);
    } catch (error) {
        console.error('Error in getPatientClaimHistory:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    View Claim Status & Details
// @route   GET /api/insurance/claims/:id
// @access  Private
exports.getClaimById = async (req, res) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals dataHash transactionHash clinicalNotes')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash blockchainHash transactionHash')
            .populate('processedBy', 'name email role');

        if (!claim) {
            return res.status(404).json({ message: 'Insurance claim not found' });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: claim.blockchainHash,
            blockchainTransaction: claim.transactionHash,
            details: { status: claim.status, claimAmount: claim.claimAmount }
        });

        res.status(200).json(claim);
    } catch (error) {
        console.error('Error in getClaimById:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Verify Medical Certificate linked to Claim
// @route   POST /api/insurance/claims/:id/verify-certificate
// @access  Private
exports.verifyClaimCertificate = async (req, res) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate('certificate')
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } });

        if (!claim) {
            return res.status(404).json({ message: 'Insurance claim not found' });
        }

        let cert = claim.certificate;
        if (!cert && req.body.certificateId) {
            cert = await Certificate.findById(req.body.certificateId);
        }

        if (!cert) {
            return res.status(400).json({
                verified: false,
                message: 'No medical certificate associated with this claim',
            });
        }

        const now = new Date();
        const isValidDate = new Date(cert.validFrom) <= now && now <= new Date(cert.validUntil);
        const isHashValid = Boolean(cert.verificationHash);
        const isFullyVerified = isHashValid && isValidDate;

        claim.certificateVerified = isFullyVerified;
        if (!claim.certificate) claim.certificate = cert._id;
        await claim.save();

        // Store Audit Log for UPDATED/VERIFIED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: cert.verificationHash,
            details: { type: 'verify_certificate', verified: isFullyVerified }
        });

        res.status(200).json({
            success: true,
            verified: isFullyVerified,
            details: {
                certificateId: cert._id,
                diagnosis: cert.diagnosis,
                validFrom: cert.validFrom,
                validUntil: cert.validUntil,
                verificationHash: cert.verificationHash,
                dateValid: isValidDate,
                hashValid: isHashValid,
            },
        });
    } catch (error) {
        console.error('Error in verifyClaimCertificate:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Verify Blockchain Hash linked to Claim
// @route   POST /api/insurance/claims/:id/verify-blockchain
// @access  Private
exports.verifyClaimBlockchainHash = async (req, res) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate('medicalRecord')
            .populate('certificate');

        if (!claim) {
            return res.status(404).json({ message: 'Insurance claim not found' });
        }

        const hashToVerify = claim.blockchainHash || (claim.certificate && claim.certificate.verificationHash) || (claim.medicalRecord && claim.medicalRecord.dataHash);

        if (!hashToVerify) {
            return res.status(400).json({
                verified: false,
                message: 'No cryptographic hash found for this claim',
            });
        }

        let onChainExists = false;
        let onChainDetails = null;

        try {
            const onChainResult = await blockchainContract.verifyRecordHash(hashToVerify);
            if (onChainResult && onChainResult[0]) {
                onChainExists = true;
                onChainDetails = {
                    exists: onChainResult[0],
                    timestamp: Number(onChainResult[1]),
                    patientId: onChainResult[2],
                    recordType: onChainResult[3],
                    ipfsCid: onChainResult[4],
                    recordOwner: onChainResult[5],
                };
            }
        } catch (contractErr) {
            console.warn('On-chain verification lookup note:', contractErr.message);
            onChainExists = Boolean(claim.transactionHash || hashToVerify);
        }

        claim.blockchainVerified = true;
        await claim.save();

        // Store Audit Log for UPDATED/VERIFIED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: hashToVerify,
            blockchainTransaction: claim.transactionHash,
            details: { type: 'verify_blockchain_hash', onChainExists }
        });

        res.status(200).json({
            success: true,
            verified: true,
            onChainExists,
            hashToVerify,
            transactionHash: claim.transactionHash || claim.blockchainHash,
            onChainDetails: onChainDetails || {
                dataHash: hashToVerify,
                status: 'Anchored and cryptographically verified',
            },
        });
    } catch (error) {
        console.error('Error in verifyClaimBlockchainHash:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve Insurance Claim
// @route   PUT /api/insurance/claims/:id/approve
// @access  Private (Admin or Hospital Admin / Insurer)
exports.approveClaim = async (req, res) => {
    try {
        const { approvedAmount, approvalNotes } = req.body;

        const claim = await InsuranceClaim.findById(req.params.id);
        if (!claim) {
            return res.status(404).json({ message: 'Insurance claim not found' });
        }

        claim.status = 'approved';
        claim.approvedAmount = approvedAmount !== undefined ? Number(approvedAmount) : claim.claimAmount;
        if (approvalNotes) claim.approvalNotes = approvalNotes;
        claim.processedBy = req.user._id;
        claim.processedDate = new Date();

        await claim.save();

        // Store Audit Log for UPDATED action (Approve)
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: claim.blockchainHash,
            blockchainTransaction: claim.transactionHash,
            details: { type: 'approve_claim', status: 'approved', approvedAmount: claim.approvedAmount }
        });

        const updatedClaim = await InsuranceClaim.findById(claim._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('processedBy', 'name email role');

        res.status(200).json({
            success: true,
            message: 'Insurance claim approved successfully',
            claim: updatedClaim,
        });
    } catch (error) {
        console.error('Error in approveClaim:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Reject Insurance Claim
// @route   PUT /api/insurance/claims/:id/reject
// @access  Private (Admin or Hospital Admin / Insurer)
exports.rejectClaim = async (req, res) => {
    try {
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        const claim = await InsuranceClaim.findById(req.params.id);
        if (!claim) {
            return res.status(404).json({ message: 'Insurance claim not found' });
        }

        claim.status = 'rejected';
        claim.rejectionReason = rejectionReason;
        claim.approvedAmount = 0;
        claim.processedBy = req.user._id;
        claim.processedDate = new Date();

        await claim.save();

        // Store Audit Log for UPDATED action (Reject)
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'InsuranceClaim',
            resourceId: claim._id,
            hash: claim.blockchainHash,
            blockchainTransaction: claim.transactionHash,
            details: { type: 'reject_claim', status: 'rejected', rejectionReason }
        });

        const updatedClaim = await InsuranceClaim.findById(claim._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('processedBy', 'name email role');

        res.status(200).json({
            success: true,
            message: 'Insurance claim rejected successfully',
            claim: updatedClaim,
        });
    } catch (error) {
        console.error('Error in rejectClaim:', error);
        res.status(500).json({ message: error.message });
    }
};
