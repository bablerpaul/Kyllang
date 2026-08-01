const Consent = require('../../../models/Consent');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const AuditLog = require('../../../models/AuditLog');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');

// Helper to resolve Patient
const getPatientDoc = async (userId) => {
    let patient = await Patient.findOne({ user: userId });
    if (!patient) {
        patient = await Patient.create({ user: userId });
    }
    return patient;
};

// @desc    Grant Doctor Access
// @route   POST /api/consent/grant-doctor
// @access  Private (Patient only)
exports.grantDoctorAccess = async (req, res) => {
    try {
        const { doctorId, doctorUserId, doctorName, scope, durationDays } = req.body;

        if (!doctorId && !doctorUserId && !doctorName) {
            return res.status(400).json({ message: 'doctorId, doctorUserId, or doctorName is required' });
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
            consent,
        });
    } catch (error) {
        console.error('Error in grantDoctorAccess:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Revoke Doctor Access
// @route   POST /api/consent/revoke-doctor
// @access  Private (Patient only)
exports.revokeDoctorAccess = async (req, res) => {
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
            return res.status(404).json({ message: 'No active doctor consent found to revoke' });
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
            revokedCount: consents.length,
        });
    } catch (error) {
        console.error('Error in revokeDoctorAccess:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Grant Insurance Access
// @route   POST /api/consent/grant-insurance
// @access  Private (Patient only)
exports.grantInsuranceAccess = async (req, res) => {
    try {
        const { providerName, insuranceUserId, scope, durationDays } = req.body;

        if (!providerName && !insuranceUserId) {
            return res.status(400).json({ message: 'providerName or insuranceUserId is required' });
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
            consent,
        });
    } catch (error) {
        console.error('Error in grantInsuranceAccess:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Revoke Consent by Consent ID
// @route   PUT /api/consent/:id/revoke
// @access  Private (Patient only)
exports.revokeConsentById = async (req, res) => {
    try {
        const consent = await Consent.findById(req.params.id);
        if (!consent) {
            return res.status(404).json({ message: 'Consent record not found' });
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
            consent,
        });
    } catch (error) {
        console.error('Error in revokeConsentById:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get My Active Consents
// @route   GET /api/consent
// @access  Private
exports.getMyConsents = async (req, res) => {
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

        res.status(200).json(consents);
    } catch (error) {
        console.error('Error in getMyConsents:', error);
        res.status(500).json({ message: error.message });
    }
};
