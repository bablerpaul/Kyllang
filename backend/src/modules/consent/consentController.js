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

/**
 * grantDoctorAccess
 * @description Handles operations for grantDoctorAccess. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.grantDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId, doctorUserId, doctorName, scope, durationDays } = req.body;

        if (!doctorId && !doctorUserId && !doctorName) {
            return res.status(400).json({ success: false, message: 'doctorId, doctorUserId, or doctorName is required' , error: 'doctorId, doctorUserId, or doctorName is required'  });
        }

        const patientDoc = await getPatientDoc(req.user._id);

        let targetDoctorUser = null;
        let targetDoctorDoc = null;

        if (doctorUserId) {
            targetDoctorUser = await User.findById(doctorUserId);
            targetDoctorDoc = await Doctor.findOne({ user: doctorUserId });
        } else if (doctorId) {
            targetDoctorDoc = await Doctor.findById(doctorId);
            if (targetDoctorDoc) {
                targetDoctorUser = await User.findById(targetDoctorDoc.user);
            } else {
                targetDoctorUser = await User.findById(doctorId);
            }
        }

        const days = durationDays ? Number(durationDays) : 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        // Generate digital consent signature hash
        const signaturePayload = `${patientDoc._id}|${targetDoctorUser ? targetDoctorUser._id : 'DOCTOR'}|${scope || 'full_access'}|${expiresAt.toISOString()}`;
        const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        // Revoke any existing active consents for this doctor first
        await Consent.updateMany(
            {
                patient: patientDoc._id,
                grantedToRole: 'doctor',
                $or: [
                    { grantedTo: targetDoctorUser ? targetDoctorUser._id : undefined },
                    { grantedToDoctor: targetDoctorDoc ? targetDoctorDoc._id : undefined }
                ]
            },
            { status: 'revoked' }
        );

        const consent = await Consent.create({
            patient: patientDoc._id,
            patientUser: req.user._id,
            grantedTo: targetDoctorUser ? targetDoctorUser._id : undefined,
            grantedToDoctor: targetDoctorDoc ? targetDoctorDoc._id : undefined,
            grantedToRole: 'doctor',
            grantedToEntityName: doctorName || (targetDoctorUser ? targetDoctorUser.name : 'Doctor Access'),
            scope: scope || 'full_access',
            status: 'active',
            grantedAt: new Date(),
            expiresAt,
            signatureHash,
        });

        // Add doctor to assignedDoctors array in Patient model
        if (targetDoctorDoc && !patientDoc.assignedDoctors.includes(targetDoctorDoc._id)) {
            patientDoc.assignedDoctors.push(targetDoctorDoc._id);
            await patientDoc.save();
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
 * @description Handles operations for revokeDoctorAccess. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.revokeDoctorAccess = async (req, res, next) => {
    try {
        const { doctorId, doctorUserId, consentId } = req.body;

        const patientDoc = await getPatientDoc(req.user._id);

        let filter = { patient: patientDoc._id, grantedToRole: 'doctor', status: 'active' };

        if (consentId) {
            filter = { _id: consentId, patient: patientDoc._id };
        } else if (doctorUserId || doctorId) {
            filter.$or = [
                { grantedTo: doctorUserId || doctorId },
                { grantedToDoctor: doctorId || doctorUserId }
            ];
        }

        const consents = await Consent.find(filter);
        if (consents.length === 0) {
            return res.status(404).json({ success: false, message: 'No active doctor consent found to revoke' , error: 'No active doctor consent found to revoke'  });
        }

        for (const c of consents) {
            c.status = 'revoked';
            await c.save();
        }

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
        const { providerName, insuranceUserId, scope, durationDays } = req.body;

        if (!providerName && !insuranceUserId) {
            return res.status(400).json({ success: false, message: 'providerName or insuranceUserId is required' , error: 'providerName or insuranceUserId is required'  });
        }

        const patientDoc = await getPatientDoc(req.user._id);

        const days = durationDays ? Number(durationDays) : 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        const signaturePayload = `${patientDoc._id}|INSURANCE|${providerName}|${scope || 'full_access'}|${expiresAt.toISOString()}`;
        const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        // Revoke previous active insurance consent for this provider
        await Consent.updateMany(
            {
                patient: patientDoc._id,
                grantedToRole: 'insurance',
                grantedToEntityName: new RegExp(providerName || '', 'i')
            },
            { status: 'revoked' }
        );

        const consent = await Consent.create({
            patient: patientDoc._id,
            patientUser: req.user._id,
            grantedTo: insuranceUserId || undefined,
            grantedToRole: 'insurance',
            grantedToEntityName: providerName || 'Insurance Provider',
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
            details: { type: 'grant_insurance_access', providerName, expiresAt }
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
        const consent = await Consent.findById(req.params.id);
        if (!consent) {
            return res.status(404).json({ success: false, message: 'Consent record not found' , error: 'Consent record not found'  });
        }

        consent.status = 'revoked';
        await consent.save();

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
