const Consent = require('../models/Consent');
const Patient = require('../models/Patient');
const User = require('../models/User');

/**
 * hasActiveConsent
 * @description Handles operations for hasActiveConsent. Explains parameters, return values and usage.
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

        // Search for active consent record
        const now = new Date();
        const activeConsent = await Consent.findOne({
            $or: [{ patient: pId }, { patientUser: pUserId }, { patient: patientInput }],
            status: 'active',
            $or: [
                { grantedTo: requestingUser._id },
                { grantedToDoctor: requestingUser._id },
                { grantedToRole: requestingUser.role },
                { grantedToEntityName: new RegExp(requestingUser.name || '', 'i') }
            ],
            $or: [
                { expiresAt: { $gt: now } },
                { expiresAt: null },
                { expiresAt: { $exists: false } }
            ]
        });

        if (activeConsent) {
            return true;
        }

        // Fallback: Check if assigned doctor in Patient model
        if (requestingUser.role === 'doctor' && patientDoc && patientDoc.assignedDoctors) {
            const isAssigned = patientDoc.assignedDoctors.some(
                docId => docId.toString() === requestingUser._id.toString()
            );
            if (isAssigned) return true;
        }

        return false;
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

module.exports = { hasActiveConsent, verifyConsent };
