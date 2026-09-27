const fs = require('fs');
const InsuranceClaim = require('../../../models/InsuranceClaim');
const Certificate = require('../../../models/Certificate');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const blockchainContract = require('../../../blockchain');
const storageService = require('../secure-storage/services/storageService');
const SecureFile = require('../secure-storage/models/SecureFile');
const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');
const { patientCertificateIds } = require('../../../services/certificatePatientService');
const Consent = require('../../../models/Consent');

/**
 * resolvePatientId
 * @description Resolves a Patient._id from a Patient._id or User._id input.
 * Does NOT auto-create Patient documents (hardened — 15.3-A-6).
 * Returns null if no patient is found.
 * @param {*} idInput - idInput parameter
 * @returns {Promise<ObjectId|null>}
 */
const resolvePatientId = async (idInput) => {
    const patient = await Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    return patient ? patient._id : null;
};

// ── Step 84: insurance_officer claim authorization ──────────────────────────
// hasActiveConsent's scope filter is applied ONLY for role 'doctor' (middlewares/consentMiddleware.js) —
// broadening that shared, cross-cutting helper would also change behavior for every OTHER reachable caller
// that passes an insurance_officer requestingUser without overriding requiredScope (e.g. several
// hasActiveConsent(...) calls in storageController.js's generic upload/view/download/verify/delete routes,
// which have no role restriction and default to requiredScope: 'full_access'). To avoid that unrelated
// side effect, these two helpers are LOCAL to this file and used ONLY for insurance_officer claim access —
// they reuse consentScopeFilter (already exported for reuse) rather than reinventing scope matching, and
// they never touch hasActiveConsent's own behavior for doctor/admin/hospital_admin or any other caller.

/**
 * resolveInsuranceAuthorizedPatientIds
 * @description Patient._id strings for which THIS SPECIFIC insurance officer (by req.user._id — never by
 * name, role, or any client-supplied field) holds an active, unexpired Consent with scope 'insurance_claims'
 * (or 'full_access', per the existing Consent scope semantics — see consentScopeFilter). Used to scope
 * getAllClaims exactly like the existing doctor branch already scopes itself via active consents.
 */
const resolveInsuranceAuthorizedPatientIds = async (officerUser) => {
    const now = new Date();
    const activeConsents = await Consent.find({
        $and: [
            { grantedToRole: 'insurance' },
            { status: 'active' },
            { grantedTo: officerUser._id },
            { $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }] },
            consentScopeFilter('insurance_claims'),
        ],
    }).select('patient').lean();
    return [...new Set(activeConsents.map((c) => (c.patient ? c.patient.toString() : '')).filter(Boolean))];
};

/**
 * hasInsuranceClaimAccess
 * @description Single-patient version of the same check, for the claim/document endpoints operating on one
 * already-resolved patient. Knowing a claim/file id is never sufficient — the officer must hold a consent
 * specifically bound (by id) to them, from that exact patient, with an insurance-permitting scope.
 * @param {*} patientIdInput - a Patient._id or User._id (resolved read-only; never creates a profile)
 * @param {*} officerUser - req.user (must be the authenticated insurance_officer)
 * @returns {Promise<boolean>}
 */
const hasInsuranceClaimAccess = async (patientIdInput, officerUser) => {
    const resolvedPatientId = await resolvePatientId(patientIdInput);
    if (!resolvedPatientId) return false;
    const now = new Date();
    const consent = await Consent.findOne({
        $and: [
            { patient: resolvedPatientId },
            { grantedToRole: 'insurance' },
            { status: 'active' },
            { grantedTo: officerUser._id },
            { $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }] },
            consentScopeFilter('insurance_claims'),
        ],
    });
    return !!consent;
};

/**
 * canAdjudicateClaim
 * @description Per-claim authorization for the adjudicating endpoints — approve / reject, and the certificate / blockchain
 * verification that precedes them. The route already limits callers to admin / hospital_admin /
 * insurance_officer. Administrators keep their existing access; an insurance officer must hold the SAME patient-bound
 * consent the claim read endpoints require (hasInsuranceClaimAccess, unchanged). Any other role is denied.
 * @param {Object} claim - the InsuranceClaim document (its `patient` ref decides; nothing from the request body does)
 * @param {Object} user - req.user
 * @returns {Promise<boolean>}
 */
const canAdjudicateClaim = async (claim, user) => {
    if (user.role === 'admin' || user.role === 'hospital_admin') return true;
    if (user.role !== 'insurance_officer') return false;
    return claim.patient ? hasInsuranceClaimAccess(claim.patient, user) : false;
};

/**
 * submitClaim
 * @description Handles operations for submitClaim. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.submitClaim = async (req, res, next) => {
    try {
        const { patientId, provider, policyNumber, claimAmount, medicalRecordId, certificateId, treatmentSummary, diagnosisCode } = req.body;

        if (!provider || !policyNumber || !claimAmount) {
            return res.status(400).json({ success: false, message: 'provider, policyNumber, and claimAmount are required', error: 'provider, policyNumber, and claimAmount are required' });
        }

        // ── 15.3-A-1: Enforce patient ownership ───────────────────────────────
        let resolvedPatientId;
        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            // Patients can only submit claims for themselves — ignore client-supplied patientId
            resolvedPatientId = await resolvePatientId(req.user._id);
            if (!resolvedPatientId) {
                return res.status(400).json({ success: false, message: 'Patient profile not found for this user.' });
            }
        } else if (req.user.role === 'doctor') {
            // Doctors must supply a patientId and must have active consent for that patient
            if (!patientId) {
                return res.status(400).json({ success: false, message: 'patientId is required for doctors submitting claims.' });
            }
            const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Active patient consent is required to submit a claim for this patient.' });
            }
            resolvedPatientId = await resolvePatientId(patientId);
            if (!resolvedPatientId) {
                return res.status(404).json({ success: false, message: 'Patient not found.' });
            }
        } else {
            // admin, hospital_admin, insurance_officer — accept any patientId
            if (!patientId) {
                return res.status(400).json({ success: false, message: 'patientId is required.' });
            }
            resolvedPatientId = await resolvePatientId(patientId);
            if (!resolvedPatientId) {
                return res.status(404).json({ success: false, message: 'Patient not found.' });
            }
        }

        let emrDoc = null;
        if (medicalRecordId) {
            emrDoc = await MedicalRecord.findById(medicalRecordId);
            // ── 15.3-A-7: Validate EMR belongs to the resolved patient ─────────
            if (emrDoc && emrDoc.patient && emrDoc.patient.toString() !== resolvedPatientId.toString()) {
                return res.status(400).json({ success: false, message: 'The supplied medicalRecordId does not belong to this patient.' });
            }
        }

        let certDoc = null;
        if (certificateId) {
            certDoc = await Certificate.findById(certificateId);
            // ── 15.3-A-7: Validate certificate belongs to the resolved patient ─
            // Certificate.patient is the Patient-profile _id (legacy records may hold that same patient's User _id).
            if (certDoc && certDoc.patient) {
                const ownerIds = (await patientCertificateIds(resolvedPatientId)).map(String);
                if (!ownerIds.includes(certDoc.patient.toString())) {
                    return res.status(400).json({ success: false, message: 'The supplied certificateId does not belong to this patient.' });
                }
            }
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
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash blockchainHash')
            .lean();

        res.status(201).json({
            success: true,
            message: 'Insurance claim submitted successfully',

            data: {
                claim: populatedClaim
            }
        });
    } catch (error) {
        console.error('Error in submitClaim:', error);
        next(error);
    }
};

/**
 * getAllClaims
 * @description Handles operations for getAllClaims. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllClaims = async (req, res, next) => {
    try {
        let filter = {};

        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const patientDoc = await Patient.findOne({ $or: [{ _id: req.user._id }, { user: req.user._id }] });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { user: req.user._id }] };
        } else if (req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            const docId = doctorDoc ? doctorDoc._id : null;
            
            // Consent is the ONLY source of a doctor's access to patients' claims. An assignment
            // (Patient.assignedDoctors / doctor.assignedPatients) is NOT consent, so it is never consulted here.
            const Consent = require('../../../models/Consent');
            const now = new Date();
            // ── 15.3-A-2: Use $and to avoid duplicate $or key overwrite ────────
            const activeConsents = await Consent.find({
                $and: [
                    { grantedToRole: 'doctor' },
                    { status: 'active' },
                    {
                        $or: [
                            { grantedTo: req.user._id },
                            ...(docId ? [{ grantedToDoctor: docId }] : [])
                        ]
                    },
                    {
                        $or: [
                            { expiresAt: { $gt: now } },
                            { expiresAt: null },
                            { expiresAt: { $exists: false } }
                        ]
                    }
                ]
            });
            
            const consentedPatientIds = activeConsents.map(c => c.patient ? c.patient.toString() : '');
            const allowedPatientIds = [...new Set(consentedPatientIds)].filter(Boolean);
            
            if (allowedPatientIds.length === 0) {
                await logAudit({ req, action: 'VIEWED', resource: 'InsuranceClaim', details: { count: 0 } });
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            
            if (req.query.status) filter.status = req.query.status;
        } else if (req.user.role === 'insurance_officer') {
            // Step 84: was unrestricted (filter = {}) — now scoped to only the patients who have actively
            // granted THIS officer insurance-claim consent, mirroring the doctor branch above.
            const allowedPatientIds = await resolveInsuranceAuthorizedPatientIds(req.user);
            if (allowedPatientIds.length === 0) {
                await logAudit({ req, action: 'VIEWED', resource: 'InsuranceClaim', details: { count: 0 } });
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            if (req.query.status) filter.status = req.query.status;
        } else if (req.user.role === 'admin' || req.user.role === 'hospital_admin') {
            if (req.query.status) {
                filter.status = req.query.status;
            }
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized for Insurance Claim listing.' });
        }

        const claims = await InsuranceClaim.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'InsuranceClaim',
            details: { count: claims.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: claims });
    } catch (error) {
        console.error('Error in getAllClaims:', error);
        next(error);
    }
};

/**
 * getPatientClaimHistory
 * @description Handles operations for getPatientClaimHistory. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPatientClaimHistory = async (req, res, next) => {
    try {
        const pId = await resolvePatientId(req.params.patientId);

        // Verify Authorization
        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const patientDoc = await Patient.findOne({ $or: [{ _id: req.user._id }, { user: req.user._id }] });
            const userPId = patientDoc ? patientDoc._id : req.user._id;
            if (pId.toString() !== userPId.toString() && req.params.patientId !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to view this claim history.' });
            }
        } else if (req.user.role === 'doctor') {
            const isAllowed = await hasActiveConsent({ patientInput: req.params.patientId, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view medical records.' });
            }
        } else if (req.user.role === 'insurance_officer') {
            // Step 84: substituting another patient's :patientId is no longer sufficient by itself.
            const isAllowed = await hasInsuranceClaimAccess(req.params.patientId, req.user);
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to view claim history.' });
            }
        } else if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to view claim history.' });
        }

        const claims = await InsuranceClaim.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }, { user: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'InsuranceClaim',
            resourceId: req.params.patientId,
            details: { type: 'get_patient_claims', count: claims.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: claims });
    } catch (error) {
        console.error('Error in getPatientClaimHistory:', error);
        next(error);
    }
};

/**
 * getClaimById
 * @description Handles operations for getClaimById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getClaimById = async (req, res, next) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate vitals dataHash transactionHash clinicalNotes')
            .populate('certificate', 'diagnosis validFrom validUntil verificationHash blockchainHash transactionHash')
            .populate('processedBy', 'name email role')
            .lean();

        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' , error: 'Insurance claim not found'  });
        }

        // Verify Authorization
        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const isOwner = (claim.user && claim.user.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient.user && claim.patient.user._id.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient._id.toString() === req.user._id.toString());
            if (!isOwner) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to view this claim.' });
            }
        } else if (req.user.role === 'doctor') {
            const isAllowed = await hasActiveConsent({ patientInput: claim.patient._id, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this claim.' });
            }
        } else if (req.user.role === 'insurance_officer') {
            // Step 84: knowing this claim's ObjectId is no longer sufficient by itself.
            const isAllowed = claim.patient ? await hasInsuranceClaimAccess(claim.patient._id, req.user) : false;
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to view this claim.' });
            }
        } else if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to view claim.' });
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

        res.status(200).json({ success: true, message: 'Operation successful', data: claim });
    } catch (error) {
        console.error('Error in getClaimById:', error);
        next(error);
    }
};

/**
 * verifyClaimCertificate
 * @description Handles operations for verifyClaimCertificate. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.verifyClaimCertificate = async (req, res, next) => {
    try {
        // `patient` stays a raw reference (it was never part of the response): authorization and the certificate
        // ownership check resolve it themselves, including legacy User-id references.
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate('certificate');

        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' , error: 'Insurance claim not found'  });
        }

        // Authorize against the claim's patient BEFORE any certificate lookup or disclosure.
        if (!(await canAdjudicateClaim(claim, req.user))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to verify this claim.', error: 'Access Denied: Patient active insurance consent is required to verify this claim.' });
        }

        let cert = claim.certificate;
        if (!cert && req.body.certificateId) {
            if (!/^[0-9a-fA-F]{24}$/.test(String(req.body.certificateId))) {
                return res.status(400).json({ success: false, message: 'Invalid certificateId', error: 'Invalid certificateId' });
            }
            cert = await Certificate.findById(req.body.certificateId);
        }

        if (!cert) {
            return res.status(400).json({
                success: false,
                message: 'No medical certificate associated with this claim',
                error: 'No medical certificate associated with this claim',

                data: {
                    verified: false
                }
            });
        }

        // The certificate must belong to the claim's own patient (Patient._id, or that patient's User._id on legacy
        // records) — a claim can never be verified against, or linked to, another patient's certificate.
        const certOwnerIds = (await patientCertificateIds(claim.patient)).map(String);
        if (!cert.patient || !certOwnerIds.includes(String(cert.patient))) {
            return res.status(400).json({ success: false, message: "The certificate does not belong to this claim's patient.", error: "The certificate does not belong to this claim's patient." });
        }

        const now = new Date();
        const isValidDate = new Date(cert.validFrom) <= now && now <= new Date(cert.validUntil);
        const isHashValid = Boolean(cert.verificationHash);
        // Revocation takes precedence over the validity window (revoked > expired > active).
        const isRevoked = cert.status === 'revoked';
        const isFullyVerified = isHashValid && isValidDate && !isRevoked;

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
            message: "Operation successful",

            data: {
                verified: isFullyVerified,

                details: {
                    certificateId: cert._id,
                    diagnosis: cert.diagnosis,
                    validFrom: cert.validFrom,
                    validUntil: cert.validUntil,
                    verificationHash: cert.verificationHash,
                    dateValid: isValidDate,
                    hashValid: isHashValid,
                    revoked: isRevoked,
                }
            }
        });
    } catch (error) {
        console.error('Error in verifyClaimCertificate:', error);
        next(error);
    }
};

/**
 * verifyClaimBlockchainHash
 * @description Handles operations for verifyClaimBlockchainHash. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.verifyClaimBlockchainHash = async (req, res, next) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id)
            .populate('medicalRecord')
            .populate('certificate');

        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' , error: 'Insurance claim not found'  });
        }

        // Authorize against the claim's patient BEFORE reading or disclosing any hash.
        if (!(await canAdjudicateClaim(claim, req.user))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to verify this claim.', error: 'Access Denied: Patient active insurance consent is required to verify this claim.' });
        }

        const hashToVerify = claim.blockchainHash || (claim.certificate && claim.certificate.verificationHash) || (claim.medicalRecord && claim.medicalRecord.dataHash);

        if (!hashToVerify) {
            return res.status(400).json({
                success: false,
                message: 'No cryptographic hash found for this claim',
                error: 'No cryptographic hash found for this claim',

                data: {
                    verified: false
                }
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
            // Fail CLOSED: a lookup error is never a verification success — nothing is saved as verified.
            console.warn('On-chain verification lookup failed:', contractErr.message);
            await logAudit({
                req,
                action: 'UPDATED',
                resource: 'InsuranceClaim',
                resourceId: claim._id,
                hash: hashToVerify,
                blockchainTransaction: claim.transactionHash,
                details: { type: 'verify_blockchain_hash', onChainExists: false, lookupFailed: true }
            });
            return res.status(503).json({ success: false, message: 'Blockchain verification is currently unavailable. The claim was not marked as verified.', error: 'Blockchain verification is currently unavailable. The claim was not marked as verified.' });
        }

        // ── 15.3-A-4: Only mark verified when on-chain record actually exists ─
        if (onChainExists) {
            claim.blockchainVerified = true;
            await claim.save();
        }

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
            message: "Operation successful",

            data: {
                // Reflects the actual on-chain lookup — never true when no record exists.
                verified: onChainExists,
                onChainExists,
                hashToVerify,
                transactionHash: claim.transactionHash || claim.blockchainHash,

                onChainDetails: onChainDetails || {
                    dataHash: hashToVerify,
                    status: 'No on-chain record found for this hash',
                }
            }
        });
    } catch (error) {
        console.error('Error in verifyClaimBlockchainHash:', error);
        next(error);
    }
};

/**
 * approveClaim
 * @description Handles operations for approveClaim. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.approveClaim = async (req, res, next) => {
    try {
        const { approvedAmount, approvalNotes } = req.body;

        const claim = await InsuranceClaim.findById(req.params.id);
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' , error: 'Insurance claim not found'  });
        }

        // Authorize against the claim's patient BEFORE revealing its state or changing anything.
        if (!(await canAdjudicateClaim(claim, req.user))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to adjudicate this claim.', error: 'Access Denied: Patient active insurance consent is required to adjudicate this claim.' });
        }

        // ── 15.3-A-3: Guard against re-adjudication of terminal states ────────
        if (claim.status === 'approved' || claim.status === 'rejected') {
            return res.status(409).json({
                success: false,
                message: `This claim has already been ${claim.status} and cannot be re-adjudicated.`,
                error: 'CLAIM_ALREADY_ADJUDICATED'
            });
        }

        if (approvedAmount !== undefined) {
            if (
                approvedAmount === null ||
                approvedAmount === "" ||
                typeof approvedAmount === 'boolean' ||
                typeof approvedAmount === 'object' ||
                isNaN(Number(approvedAmount)) ||
                !isFinite(Number(approvedAmount)) ||
                Number(approvedAmount) < 0
            ) {
                return res.status(400).json({ success: false, message: 'Invalid approvedAmount', error: 'Invalid approvedAmount' });
            }
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

            data: {
                claim: updatedClaim
            }
        });
    } catch (error) {
        console.error('Error in approveClaim:', error);
        next(error);
    }
};

/**
 * rejectClaim
 * @description Handles operations for rejectClaim. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.rejectClaim = async (req, res, next) => {
    try {
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' , error: 'Rejection reason is required'  });
        }

        const claim = await InsuranceClaim.findById(req.params.id);
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' , error: 'Insurance claim not found'  });
        }

        // Authorize against the claim's patient BEFORE revealing its state or changing anything.
        if (!(await canAdjudicateClaim(claim, req.user))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to adjudicate this claim.', error: 'Access Denied: Patient active insurance consent is required to adjudicate this claim.' });
        }

        // ── 15.3-A-3: Guard against re-adjudication of terminal states ────────
        if (claim.status === 'approved' || claim.status === 'rejected') {
            return res.status(409).json({
                success: false,
                message: `This claim has already been ${claim.status} and cannot be re-adjudicated.`,
                error: 'CLAIM_ALREADY_ADJUDICATED'
            });
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

            data: {
                claim: updatedClaim
            }
        });
    } catch (error) {
        console.error('Error in rejectClaim:', error);
        next(error);
    }
};

/**
 * resolveClaimUploadAccess
 * @description Upload authorization for ONE claim, decided from the claim's own (raw) patient reference — never from
 * request fields. Roles (the route allows admin / hospital_admin / doctor / insurance_officer):
 *   admin / hospital_admin → existing access (unchanged)
 *   insurance_officer      → hasInsuranceClaimAccess (unchanged patient-bound insurance consent)
 *   doctor                 → the existing doctor rule (hasActiveConsent for the claim's patient)
 * The patient profile is resolved read-only (Patient._id, or a legacy User._id reference).
 * @returns {Promise<{status:number,message:string}|{claim:Object,profile:Object}>}
 */
const resolveClaimUploadAccess = async (claimId, user) => {
    const claim = await InsuranceClaim.findById(claimId);
    if (!claim) return { status: 404, message: 'Insurance claim not found' };
    const profile = claim.patient
        ? await Patient.findOne({ $or: [{ _id: claim.patient }, { user: claim.patient }] }).select('_id user').lean()
        : null;
    let allowed = false;
    let deniedMessage = 'Access Denied: Role not authorized to upload claim documents.';
    if (user.role === 'admin' || user.role === 'hospital_admin') {
        allowed = true;
    } else if (user.role === 'insurance_officer') {
        allowed = claim.patient ? await hasInsuranceClaimAccess(claim.patient, user) : false;
        deniedMessage = 'Access Denied: Patient active insurance consent is required to upload documents for this claim.';
    } else if (user.role === 'doctor') {
        allowed = profile ? await hasActiveConsent({ patientInput: profile._id, requestingUser: user }) : false;
        deniedMessage = 'Access Denied: Active patient consent is required to upload documents for this claim.';
    }
    if (!allowed) return { status: 403, message: deniedMessage };
    if (!profile) return { status: 400, message: "This claim's patient could not be resolved." };
    return { claim, profile };
};

/**
 * authorizeClaimDocumentUpload
 * @description Route middleware run BEFORE multer: an unauthorized or not-found request is answered before any file is
 * written to disk. The handler re-checks (defense in depth) before anything is stored.
 */
exports.authorizeClaimDocumentUpload = async (req, res, next) => {
    try {
        const access = await resolveClaimUploadAccess(req.params.id, req.user);
        if (access.status) {
            return res.status(access.status).json({ success: false, message: access.message, error: access.message });
        }
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * uploadClaimDocument
 * @description Handles operations for uploadClaimDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadClaimDocument = async (req, res, next) => {
    try {
        // Per-claim authorization (also enforced before multer by authorizeClaimDocumentUpload). Nothing is stored unless
        // it passes; the `finally` below removes the temp upload on every path.
        const access = await resolveClaimUploadAccess(req.params.id, req.user);
        if (access.status) {
            return res.status(access.status).json({ success: false, message: access.message, error: access.message });
        }
        const { claim, profile } = access;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload a file' , error: 'Please upload a file'  });
        }

        // The claim determines the patient. A client-supplied patient reference is never used — only checked, and a
        // mismatch is rejected instead of silently ignored.
        const suppliedPatient = req.body && (req.body.patientId || req.body.patient);
        if (suppliedPatient && ![String(profile._id), String(profile.user)].includes(String(suppliedPatient))) {
            return res.status(400).json({ success: false, message: "The supplied patient does not match this claim's patient.", error: "The supplied patient does not match this claim's patient." });
        }

        // Same stored reference as before (the patient's User._id when linked, else the Patient._id).
        const patientId = profile.user || profile._id;
        
        const filePath = req.file.path;

        const { secureFile } = await storageService.uploadSecurePayload({
            filePath,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            patientId,
            uploaderId: req.user._id,
            documentType: 'InsuranceClaim',
            linkedInsurance: claim._id
        });

        await logAudit({
            req,
            action: 'Insurance Upload',
            resource: 'InsuranceClaim',
            resourceId: secureFile._id,
            details: { type: 'upload_claim_document', claimId: claim._id, fileName: secureFile.fileName }
        });

        res.status(201).json({
            success: true,
            message: 'Document securely uploaded and linked to claim',

            data: {
                document: secureFile
            }
        });
    } catch (error) {
        console.error('Error in uploadClaimDocument:', error);
        next(error);
    } finally {
        if (req.file && req.file.path) {
            fs.promises.unlink(req.file.path).catch(err => console.error('Error deleting temp file:', err));
        }
    }
};

/**
 * getClaimDocuments
 * @description Handles operations for getClaimDocuments. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getClaimDocuments = async (req, res, next) => {
    try {
        const claim = await InsuranceClaim.findById(req.params.id).populate('patient');
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' });
        }

        // Verify Authorization
        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const isOwner = (claim.user && claim.user.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient.user && claim.patient.user.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient._id.toString() === req.user._id.toString());
            if (!isOwner) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to view documents for this claim.' });
            }
        } else if (req.user.role === 'doctor') {
            const isAllowed = await hasActiveConsent({ patientInput: claim.patient._id, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view claim documents.' });
            }
        } else if (req.user.role === 'insurance_officer') {
            // Step 84: knowing this claim's ObjectId is no longer sufficient by itself.
            const isAllowed = claim.patient ? await hasInsuranceClaimAccess(claim.patient._id, req.user) : false;
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to view claim documents.' });
            }
        } else if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to view claim documents.' });
        }

        const documents = await SecureFile.find({ linkedInsurance: req.params.id })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, message: 'Operation successful', data: documents });
    } catch (error) {
        console.error('Error in getClaimDocuments:', error);
        next(error);
    }
};

/**
 * downloadClaimDocument
 * @description Handles operations for downloadClaimDocument. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.downloadClaimDocument = async (req, res, next) => {
    try {
        const fileId = req.params.fileId;
        const claimId = req.params.id;

        const secureDoc = await SecureFile.findOne({ _id: fileId, linkedInsurance: claimId });
        if (!secureDoc) {
            return res.status(404).json({ success: false, message: 'Document not found or not linked to this claim' , error: 'Document not found or not linked to this claim'  });
        }

        const claim = await InsuranceClaim.findById(claimId).populate('patient');
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Insurance claim not found' });
        }

        // Verify Authorization
        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const isOwner = (claim.user && claim.user.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient.user && claim.patient.user.toString() === req.user._id.toString()) ||
                            (claim.patient && claim.patient._id.toString() === req.user._id.toString());
            if (!isOwner) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to download this claim document.' });
            }
        } else if (req.user.role === 'doctor') {
            const isAllowed = await hasActiveConsent({ patientInput: claim.patient._id, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to download claim documents.' });
            }
        } else if (req.user.role === 'insurance_officer') {
            // Step 84: a fileId that genuinely belongs to this claim (already verified above) is still not
            // sufficient by itself — the officer must hold consent for the claim's patient.
            const isAllowed = claim.patient ? await hasInsuranceClaimAccess(claim.patient._id, req.user) : false;
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active insurance consent is required to download claim documents.' });
            }
        } else if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to download claim documents.' });
        }

        const { fileBuffer, verified } = await storageService.retrieveSecurePayload(fileId);

        res.setHeader('Content-Type', secureDoc.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${secureDoc.fileName}"`);
        res.setHeader('X-Blockchain-Verified', verified);
        
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error in downloadClaimDocument:', error);
        next(error);
    }
};
