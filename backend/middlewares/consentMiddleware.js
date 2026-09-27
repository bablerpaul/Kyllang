const Consent = require('../models/Consent');
const Patient = require('../models/Patient');
const User = require('../models/User');

// The scope values a Consent can carry (the model enum; 'full_access' is the default and covers every resource).
const CONSENT_SCOPES = Consent.schema.path('scope').enumValues;

/**
 * consentScopeFilter
 * @description The Consent.scope condition a DOCTOR's consent must satisfy for a resource: scope is exactly 'full_access' or
 * exactly the required scope. Fail-closed: a consent whose scope is missing, null, unknown or in any legacy/other format
 * matches NOTHING, and a required scope that is not a known scope value is treated as 'full_access' (so only a full_access
 * consent satisfies it). A consent for one resource scope therefore never grants another resource. A scope stored as an ARRAY
 * (malformed; only possible through a raw database write) is rejected too: MongoDB's $in would otherwise match any element.
 * @param {string} requiredScope - one of the Consent scope values (default 'full_access')
 * @returns {Object} a MongoDB condition object for a Consent query
 */
const consentScopeFilter = (requiredScope = 'full_access') => {
    const wanted = (typeof requiredScope === 'string' && CONSENT_SCOPES.includes(requiredScope)) ? requiredScope : 'full_access';
    return { scope: { $in: [...new Set(['full_access', wanted])], $not: { $type: 'array' } } };
};

/**
 * hasActiveConsent
 * @description Handles operations for hasActiveConsent. Explains parameters, return values and usage.
 * A DOCTOR's access additionally requires the consent's scope to permit `requiredScope` (see consentScopeFilter). The patient
 * themselves, administrators and insurance officers are decided exactly as before (insurance policy is intentionally unchanged).
 * @param {*} param - param parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const hasActiveConsent = async ({ patientInput, requestingUser, requiredScope = 'full_access' }) => {
    try {
        if (!requestingUser) return false;

        // Admin has system access
        if (requestingUser.role === 'admin' || requestingUser.role === 'hospital_admin') return true;

        // Resolve patient IDs
        let patientDoc = await Patient.findOne({ $or: [{ _id: patientInput }, { user: patientInput }] });
        const pId = patientDoc ? patientDoc._id : patientInput;
        const pUserId = patientDoc ? patientDoc.user : patientInput;

        // If requesting user is the patient themselves, access is automatically granted!
        if (
            requestingUser._id.toString() === pId.toString() ||
            requestingUser._id.toString() === (pUserId ? pUserId.toString() : '')
        ) {
            return true;
        }

        const Doctor = require('../models/Doctor');
        let doctorDoc = null;
        if (requestingUser.role === 'doctor') {
            doctorDoc = await Doctor.findOne({ user: requestingUser._id });
        }

        // Who the consent may be granted TO. A doctor must be matched by identity (User id / Doctor profile id) —
        // never by a free-text name. Name matching is kept only for insurance officers, whose consents can be
        // recorded by provider name; the name is escaped and must be non-empty (an empty/unescaped pattern
        // would otherwise match every consent).
        const granteeConditions = [{ grantedTo: requestingUser._id }];
        if (doctorDoc) granteeConditions.push({ grantedToDoctor: doctorDoc._id });
        if (requestingUser.role === 'insurance_officer' && requestingUser.name && requestingUser.name.trim()) {
            const escaped = requestingUser.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Only LEGACY name-only consents (no grantedTo) are matched by name. A consent granted to a specific
            // user id is matched by that id alone, so another officer whose name merely overlaps cannot use it.
            granteeConditions.push({ grantedToRole: 'insurance', grantedTo: null, grantedToEntityName: new RegExp(escaped, 'i') });
        }

        // Search for active consent record using $and to avoid object key overwrite
        const now = new Date();
        const conditions = [
            {
                $or: [
                    { patient: pId },
                    { patientUser: pUserId },
                    { patient: patientInput }
                ]
            },
            { status: 'active' },
            { $or: granteeConditions },
            {
                $or: [
                    { expiresAt: { $gt: now } },
                    { expiresAt: { $gt: new Date() } },
                    { expiresAt: null },
                    { expiresAt: { $exists: false } }
                ]
            }
        ];
        // Consent SCOPE: a doctor's consent must permit the requested resource. (Insurance policy is intentionally unchanged.)
        if (requestingUser.role === 'doctor') conditions.push(consentScopeFilter(requiredScope));
        const activeConsent = await Consent.findOne({ $and: conditions });
        console.log("Consent Query Results:", activeConsent ? 'FOUND' : 'NOT FOUND', "for pId:", pId, "doc:", requestingUser._id);

        // An ASSIGNMENT (doctor.assignedPatients / Patient.assignedDoctors) is NOT consent: only a valid, active,
        // unexpired Consent record grants a doctor access. (The previous "assigned doctor" fallback let a doctor
        // keep access after the patient revoked or the consent expired.)
        return !!activeConsent;
    } catch (err) {
        console.error('Error checking consent:', err.message);
        return false;
    }
};

/**
 * verifyConsent
 * @description Handles operations for verifyConsent. Explains parameters, return values and usage.
 * @param {*} requiredScope - requiredScope parameter
 * @returns {*} Return value
 */
const verifyConsent = (requiredScope = 'full_access') => async (req, res, next) => {
    const patientId = req.params.patientId || req.query.patientId || req.body.patientId;

    if (!patientId) {
        return next();
    }

    const isAllowed = await hasActiveConsent({
        patientInput: patientId,
        requestingUser: req.user,
        requiredScope,
    });

    if (!isAllowed) {
        return res.status(403).json({
            message: 'Access Denied: Patient active consent is required to view this medical data.',
        });
    }

    next();
};

module.exports = { hasActiveConsent, verifyConsent, consentScopeFilter };
