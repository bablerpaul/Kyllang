const Consent = require('../../../models/Consent');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const AuditLog = require('../../../models/AuditLog');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');

/**
 * getPatientDoc
 * @description Handles operations for getPatientDoc. Explains parameters, return values and usage.
 * @param {*} userId - userId parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const getPatientDoc = async (userId) => {
    let patient = await Patient.findOne({ user: userId });
    if (!patient) {
        patient = await Patient.create({ user: userId });
    }
    return patient;
};


// ── Validation / resolution helpers (consent authorization) ────────────────
const isObjectIdString = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);
const CONSENT_SCOPES = Consent.schema.path('scope').enumValues;
const NOT_ASSIGNED_MESSAGE = 'Consent can only be granted to a doctor who is assigned to you.';
const NOT_INSURANCE_MESSAGE = 'Consent can only be granted to an insurance officer.';

/**
 * Resolve the doctor a patient wants to grant consent to and verify the relationship SERVER-SIDE.
 * The target must exist, must be a doctor, and must be assigned to this patient (doctor.assignedPatients — the
 * application's assignment relationship, the same one GET /api/patient/doctors lists). Never trusts a name.
 * Returns { error: { status, message } } or { doctorUser, doctorProfile }.
 */
const resolveAssignedDoctor = async (patientUserId, { doctorUserId, doctorId }) => {
    for (const v of [doctorUserId, doctorId]) {
        if (v !== undefined && v !== null && !isObjectIdString(v)) {
            return { error: { status: 400, message: 'Invalid doctor identifier.' } };
        }
    }
    if (!doctorUserId && !doctorId) {
        return { error: { status: 400, message: 'doctorUserId is required. A doctor cannot be identified by name.' } };
    }

    let doctorUser = null;
    let doctorProfile = null;
    if (doctorUserId) {
        doctorUser = await User.findById(doctorUserId);
    } else {
        // doctorId may be a Doctor profile id or a User id (existing API contract)
        doctorProfile = await Doctor.findById(doctorId);
        doctorUser = doctorProfile ? await User.findById(doctorProfile.user) : await User.findById(doctorId);
    }
    if (!doctorUser) return { error: { status: 404, message: 'Doctor not found.' } };

    // Same response for "not a doctor" and "not assigned to you" (no account-type probing by id).
    if (doctorUser.role !== 'doctor') return { error: { status: 403, message: NOT_ASSIGNED_MESSAGE } };
    const assigned = (doctorUser.assignedPatients || []).some((id) => String(id) === String(patientUserId));
    if (!assigned) return { error: { status: 403, message: NOT_ASSIGNED_MESSAGE } };

    if (!doctorProfile) doctorProfile = await Doctor.findOne({ user: doctorUser._id });
    return { doctorUser, doctorProfile };
};

/**
 * A grant adds the doctor to Patient.assignedDoctors as a side effect. When the LAST active consent for that doctor is
 * revoked, undo it. (Access itself never depends on this list — hasActiveConsent only honours Consent records — but other
 * list endpoints still read it, so it must not outlive the consent.)
 */
const releaseDoctorAssignments = async (patientId, revokedConsents) => {
    const now = new Date();
    const doctorProfileIds = new Set(revokedConsents.filter((c) => c.grantedToDoctor).map((c) => String(c.grantedToDoctor)));
    for (const dId of doctorProfileIds) {
        const stillActive = await Consent.exists({
            patient: patientId,
            grantedToRole: 'doctor',
            grantedToDoctor: dId,
            status: 'active',
            $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }],
        });
        if (!stillActive) await Patient.updateOne({ _id: patientId }, { $pull: { assignedDoctors: dId } });
    }
};

/**
 * grantDoctorAccess
 * @description A patient grants a doctor ASSIGNED TO THEM consent to their record.
 * The patient is always the authenticated user (never taken from the body). The target doctor must be resolved by id,
 * must be a doctor, and must be assigned to this patient; otherwise nothing is created or modified. `doctorName` is not
 * accepted as a target. Route-level authorization restricts this endpoint to patients.
 * POST /api/consent/grant-doctor  { doctorUserId | doctorId, scope?, durationDays? }
 */
exports.grantDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId, doctorUserId, scope, durationDays } = req.body;

        // ── Validate everything BEFORE touching the database ───────────────
        if (scope !== undefined && scope !== null && !CONSENT_SCOPES.includes(scope)) {
            return res.status(400).json({ success: false, message: `Invalid scope. Allowed: ${CONSENT_SCOPES.join(', ')}`, error: 'Invalid scope' });
        }
        let days = 30;
        if (durationDays !== undefined && durationDays !== null && durationDays !== '') {
            days = Number(durationDays);
            if (!Number.isFinite(days) || days <= 0) {
                return res.status(400).json({ success: false, message: 'durationDays must be a positive number', error: 'Invalid durationDays' });
            }
        }

        const resolved = await resolveAssignedDoctor(req.user._id, { doctorUserId, doctorId });
        if (resolved.error) {
            return res.status(resolved.error.status).json({ success: false, message: resolved.error.message, error: resolved.error.message });
        }
        const { doctorUser, doctorProfile } = resolved;

        const patientDoc = await getPatientDoc(req.user._id);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        // Generate digital consent signature hash
        const signaturePayload = `${patientDoc._id}|${doctorUser._id}|${scope || 'full_access'}|${expiresAt.toISOString()}`;
        const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        // Supersede this patient's existing ACTIVE consents for THIS doctor only.
        // Every value in the filter is a resolved, defined id — an undefined value can never widen the match.
        const sameDoctor = [{ grantedTo: doctorUser._id }];
        if (doctorProfile) sameDoctor.push({ grantedToDoctor: doctorProfile._id });
        await Consent.updateMany(
            { patient: patientDoc._id, grantedToRole: 'doctor', status: 'active', $or: sameDoctor },
            { status: 'revoked' }
        );

        const consent = await Consent.create({
            patient: patientDoc._id,
            patientUser: req.user._id,
            grantedTo: doctorUser._id,
            ...(doctorProfile ? { grantedToDoctor: doctorProfile._id } : {}),
            grantedToRole: 'doctor',
            grantedToEntityName: doctorUser.name,
            scope: scope || 'full_access',
            status: 'active',
            grantedAt: new Date(),
            expiresAt,
            signatureHash,
        });

        // Add doctor to assignedDoctors array in Patient model
        if (doctorProfile) {
            await Patient.updateOne({ _id: patientDoc._id }, { $addToSet: { assignedDoctors: doctorProfile._id } });
        }

        await logAudit({
            req,
            action: 'CREATED',
            resource: 'Consent',
            resourceId: consent._id,
            hash: signatureHash,
            details: { type: 'grant_doctor_access', doctorName: consent.grantedToEntityName, expiresAt }
        });

        res.status(201).json({
            success: true,
            message: 'Doctor access consent granted successfully',

            data: {
                consent
            }
        });
    } catch (error) {
        console.error('Error in grantDoctorAccess:', error);
        next(error);
    }
};

/**
 * revokeDoctorAccess
 * @description A patient revokes doctor consent. A target is REQUIRED (consentId, or doctorUserId / doctorId); an
 * unresolved target revokes nothing (404). Revoking every doctor consent at once needs an explicit `all: true`.
 * Only the authenticated patient's own consents are ever matched.
 * POST /api/consent/revoke-doctor  { consentId | doctorUserId | doctorId | all: true }
 */
exports.revokeDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId, doctorUserId, consentId, all } = req.body;

        for (const v of [doctorId, doctorUserId, consentId]) {
            if (v !== undefined && v !== null && !isObjectIdString(v)) {
                return res.status(400).json({ success: false, message: 'Invalid identifier.', error: 'Invalid identifier' });
            }
        }
        if (!consentId && !doctorUserId && !doctorId && all !== true) {
            return res.status(400).json({ success: false, message: 'consentId or doctorUserId is required (use all: true to revoke every doctor consent).', error: 'Target required' });
        }

        const patientDoc = await Patient.findOne({ user: req.user._id });
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'No active doctor consent found to revoke', error: 'No active doctor consent found to revoke' });
        }

        let filter;
        if (consentId) {
            filter = { _id: consentId, patient: patientDoc._id };
        } else if (doctorUserId || doctorId) {
            const ids = [doctorUserId, doctorId].filter(Boolean);
            filter = { patient: patientDoc._id, grantedToRole: 'doctor', status: 'active', $or: [{ grantedTo: { $in: ids } }, { grantedToDoctor: { $in: ids } }] };
        } else {
            filter = { patient: patientDoc._id, grantedToRole: 'doctor', status: 'active' };
        }

        const consents = await Consent.find(filter);
        if (consents.length === 0) {
            return res.status(404).json({ success: false, message: 'No active doctor consent found to revoke' , error: 'No active doctor consent found to revoke'  });
        }

        for (const c of consents) {
            c.status = 'revoked';
            await c.save();
        }
        await releaseDoctorAssignments(patientDoc._id, consents);

        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'Consent',
            details: { type: 'revoke_doctor_access', revokedCount: consents.length }
        });

        res.status(200).json({
            success: true,
            message: 'Doctor access consent revoked successfully',

            data: {
                revokedCount: consents.length
            }
        });
    } catch (error) {
        console.error('Error in revokeDoctorAccess:', error);
        next(error);
    }
};

/**
 * grantInsuranceAccess
 * @description Handles operations for grantInsuranceAccess. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.grantInsuranceAccess = async (req, res, next) => {
    try {
        // The patient is ALWAYS the authenticated user; any patient id / providerName in the body is ignored.
        const { insuranceUserId, scope, durationDays } = req.body;

        // ── Validate everything BEFORE touching the database ───────────────
        if (insuranceUserId === undefined || insuranceUserId === null || insuranceUserId === '') {
            return res.status(400).json({ success: false, message: 'insuranceUserId is required. An insurance provider cannot be identified by name.', error: 'insuranceUserId is required' });
        }
        if (!isObjectIdString(insuranceUserId)) {
            return res.status(400).json({ success: false, message: 'Invalid insurance identifier.', error: 'Invalid insurance identifier' });
        }
        if (scope !== undefined && scope !== null && !CONSENT_SCOPES.includes(scope)) {
            return res.status(400).json({ success: false, message: `Invalid scope. Allowed: ${CONSENT_SCOPES.join(', ')}`, error: 'Invalid scope' });
        }
        let days = 30;
        if (durationDays !== undefined && durationDays !== null && durationDays !== '') {
            days = Number(durationDays);
            if (!Number.isFinite(days) || days <= 0) {
                return res.status(400).json({ success: false, message: 'durationDays must be a positive number', error: 'Invalid durationDays' });
            }
        }

        // The target must exist and must actually be an insurance officer. Same response for every non-insurance
        // account type (no account-type probing by id).
        const insuranceUser = await User.findById(insuranceUserId);
        if (!insuranceUser) {
            return res.status(404).json({ success: false, message: 'Insurance provider not found.', error: 'Insurance provider not found' });
        }
        if (insuranceUser.role !== 'insurance_officer') {
            return res.status(403).json({ success: false, message: NOT_INSURANCE_MESSAGE, error: NOT_INSURANCE_MESSAGE });
        }

        const patientDoc = await getPatientDoc(req.user._id);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        const signaturePayload = `${patientDoc._id}|INSURANCE|${insuranceUser._id}|${scope || 'full_access'}|${expiresAt.toISOString()}`;
        const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        // Supersede this patient's existing ACTIVE insurance consents for THIS resolved insurance officer only.
        // No name/regex is ever used, and every value in the filter is a resolved, defined id, so nothing can widen the match.
        await Consent.updateMany(
            {
                patient: patientDoc._id,
                grantedToRole: 'insurance',
                status: 'active',
                grantedTo: insuranceUser._id
            },
            { status: 'revoked' }
        );

        const consent = await Consent.create({
            patient: patientDoc._id,
            patientUser: req.user._id,
            grantedTo: insuranceUser._id,
            grantedToRole: 'insurance',
            grantedToEntityName: insuranceUser.name,
            scope: scope || 'full_access',
            status: 'active',
            grantedAt: new Date(),
            expiresAt,
            signatureHash,
        });

        await logAudit({
            req,
            action: 'CREATED',
            resource: 'Consent',
            resourceId: consent._id,
            hash: signatureHash,
            details: { type: 'grant_insurance_access', providerName: consent.grantedToEntityName, insuranceUserId: String(insuranceUser._id), expiresAt }
        });

        res.status(201).json({
            success: true,
            message: 'Insurance access consent granted successfully',

            data: {
                consent
            }
        });
    } catch (error) {
        console.error('Error in grantInsuranceAccess:', error);
        next(error);
    }
};

/**
 * revokeConsentById
 * @description Handles operations for revokeConsentById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.revokeConsentById = async (req, res, next) => {
    try {
        if (!isObjectIdString(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid consent id', error: 'Invalid consent id' });
        }
        const consent = await Consent.findById(req.params.id);
        if (!consent) {
            return res.status(404).json({ success: false, message: 'Consent record not found' , error: 'Consent record not found'  });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
            const patientUserStr = consent.patientUser ? consent.patientUser.toString() : null;
            if (patientUserStr) {
                if (patientUserStr !== req.user._id.toString()) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to revoke this consent.' });
                }
            } else {
                const Patient = require('../../../models/Patient');
                const patientDoc = await Patient.findOne({ user: req.user._id });
                if (!patientDoc || consent.patient.toString() !== patientDoc._id.toString()) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to revoke this consent.' });
                }
            }
        }

        consent.status = 'revoked';
        await consent.save();
        await releaseDoctorAssignments(consent.patient, [consent]);

        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'Consent',
            resourceId: consent._id,
            details: { type: 'revoke_consent_by_id' }
        });

        res.status(200).json({
            success: true,
            message: 'Consent revoked successfully',

            data: {
                consent
            }
        });
    } catch (error) {
        console.error('Error in revokeConsentById:', error);
        next(error);
    }
};

/**
 * getMyConsents
 * @description Handles operations for getMyConsents. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getMyConsents = async (req, res, next) => {
    try {
        const patientDoc = await Patient.findOne({ user: req.user._id });
        const pId = patientDoc ? patientDoc._id : req.user._id;

        const consents = await Consent.find({
            $or: [{ patient: pId }, { patientUser: req.user._id }]
        })
            .populate('grantedTo', 'name email role')
            .populate('grantedToDoctor', 'specialty licenseNumber')
            .sort({ createdAt: -1 });

        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Consent',
            details: { count: consents.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: consents });
    } catch (error) {
        console.error('Error in getMyConsents:', error);
        next(error);
    }
};
