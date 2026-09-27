const Prescription = require('../../../models/Prescription');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');

const isAdminRole = (user) => user.role === 'admin' || user.role === 'hospital_admin';

/**
 * canReadPatient
 * @description The ONE read-authorization decision for a patient's prescription data: the patient themselves, an
 * administrator, or a requester holding an ACTIVE, UNEXPIRED Consent for that patient — all decided by hasActiveConsent.
 * Assignments (Patient.assignedDoctors / doctor.assignedPatients), record authorship and names never grant access. A
 * record with no patient reference is readable by administrators only (never an undefined id into a consent query).
 * @param {Object} user - req.user
 * @param {*} patientRef - Patient._id (or legacy User._id) taken from the RECORD / route being read
 * @returns {Promise<boolean>}
 */
const canReadPatient = async (user, patientRef) => {
    if (!patientRef) return isAdminRole(user);
    return hasActiveConsent({ patientInput: patientRef, requestingUser: user, requiredScope: 'prescriptions' });
};

/**
 * consentedPatientIdsForDoctor
 * @description Exact consent-derived patient ids for a doctor: active, unexpired Consent granted to THIS doctor
 * (by user id or Doctor profile id). Assignments are never consulted.
 */
const consentedPatientIdsForDoctor = async (user) => {
    const doctorDoc = await Doctor.findOne({ user: user._id });
    const Consent = require('../../../models/Consent');
    const now = new Date();
    const granteeConditions = [{ grantedTo: user._id }];
    if (doctorDoc) granteeConditions.push({ grantedToDoctor: doctorDoc._id });
    const activeConsents = await Consent.find({
        $and: [
            { grantedToRole: 'doctor' },
            { status: 'active' },
            { $or: granteeConditions },
            { $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }] },
            consentScopeFilter('prescriptions')
        ]
    });
    return [...new Set(activeConsents.map(c => (c.patient ? c.patient.toString() : '')).filter(Boolean))];
};

/**
 * keepAuthorized
 * @description Defense in depth for broad queries: whatever the query returned, keep only records whose patient
 * canReadPatient() currently allows (one verdict per distinct patient). A record with no resolvable patient is dropped.
 */
const keepAuthorized = async (user, records) => {
    const verdicts = new Map();
    const out = [];
    for (const r of records) {
        const pid = r.patient && r.patient._id ? String(r.patient._id) : (r.patient ? String(r.patient) : null);
        if (!pid) continue;
        if (!verdicts.has(pid)) verdicts.set(pid, await canReadPatient(user, pid));
        if (verdicts.get(pid)) out.push(r);
    }
    return out;
};

// ── WRITE authorization (create / update / delete) ─────────────────────────────────────────────────────────────────────
// Same single authority as the reads (hasActiveConsent, via canReadPatient): a doctor may write only for a patient with an
// ACTIVE, UNEXPIRED consent granted to that doctor; administrators keep their existing access; every other role is denied.
// Assignments, record authorship, names and request-body identity fields never grant access.
const canWriteRole = (user) => user.role === 'doctor' || isAdminRole(user);
const canWritePatient = (user, patientRef) => canReadPatient(user, patientRef);

/**
 * refBelongsToPatient
 * @description True when a stored patient reference (an EMR's `patient`) is this patient: their Patient._id, or — for
 * legacy records — their User._id. Read-only.
 */
const refBelongsToPatient = async (storedRef, patientId) => {
    if (!storedRef || !patientId) return false;
    if (String(storedRef) === String(patientId)) return true;
    const p = await Patient.findById(patientId).select('user').lean();
    return !!(p && p.user && String(storedRef) === String(p.user));
};

/**
 * immutableFieldError
 * @description Ownership (patient / doctor) and linkage (visit / EMR) fields can NEVER be changed through an update.
 * Evaluated only AFTER the caller is authorized for the record's ACTUAL patient. A supplied value equal to the record's
 * current value is a harmless no-op; anything else is refused: malformed id → 400, referenced visit/EMR that does not
 * exist → 404, any other attempted change → 400. Returns { status, message } or null.
 */
const immutableFieldError = async (body, current) => {
    const same = (v, ...cur) => cur.some(c => c && String(c) === String(v));
    for (const key of ['patient', 'patientId', 'doctor', 'doctorId', 'orderedBy']) {
        const v = body[key];
        if (v === undefined) continue;
        if (!isValidIdInput(v)) return { status: 400, message: `Invalid ${key} identifier` };
        const curr = (key === 'patient' || key === 'patientId') ? [current.patient] : [current.doctor];
        if (!same(v, ...curr)) return { status: 400, message: 'Patient and doctor ownership of a record cannot be changed.' };
    }
    for (const key of ['visit', 'visitId', 'medicalRecord', 'emrId']) {
        const v = body[key];
        if (v === undefined) continue;
        if (!isValidIdInput(v)) return { status: 400, message: `Invalid ${key} identifier` };
        if (same(v, current.medicalRecord)) continue;
        const exists = await MedicalRecord.findById(v).select('_id').lean();
        if (!exists) return { status: 404, message: 'Visit / EMR not found' };
        return { status: 400, message: 'A record cannot be re-linked to a different visit / EMR.' };
    }
    return null;
};

const denyWrite = (res, what) => res.status(403).json({ success: false, message: `Access Denied: Patient active consent is required to ${what}.`, error: `Access Denied: Patient active consent is required to ${what}.` });

/**
 * isValidIdInput
 * @description True only for a 24-hex ObjectId string or an ObjectId instance. Rejects objects/arrays/numbers/empty
 * values so callers can answer 400 instead of letting a cast error surface as a 500.
 * @param {*} v - candidate id
 * @returns {boolean}
 */
const isValidIdInput = (v) =>
    (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)) ||
    (!!v && typeof v === 'object' && (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID'));

/**
 * resolvePatientId
 * @description Resolves an EXISTING Patient._id from a Patient._id or a User._id that an existing Patient profile
 * references. Read-only and deterministic: it never creates, updates or migrates anything (a User with no Patient
 * profile is NOT given one). Returns null when the input is not a valid id or no matching Patient exists — callers
 * answer 400 (invalid, via isValidIdInput) / 404 (null). The result is not an authorization decision.
 * @param {*} idInput - Patient._id or User._id
 * @returns {Promise<ObjectId|null>}
 */
const resolvePatientId = async (idInput) => {
    if (!isValidIdInput(idInput)) return null;
    const byPatientId = await Patient.findById(idInput).select('_id').lean();
    if (byPatientId) return byPatientId._id;
    const byUserId = await Patient.findOne({ user: idInput }).select('_id').lean();
    return byUserId ? byUserId._id : null;
};

/**
 * resolveDoctorId
 * @description Resolves an EXISTING Doctor._id from a Doctor._id or a User._id that an existing Doctor profile
 * references. Read-only and deterministic: identity RESOLUTION is separate from profile PROVISIONING, so it never creates,
 * updates or migrates anything (a User with no Doctor profile is NOT given one — profiles come only from the deliberate
 * provisioning paths: admin user creation, doctor registration/login). Returns null when the input is not a valid id or no
 * matching Doctor exists; callers answer with a controlled 403. The result is not an authorization decision.
 * @param {*} idInput - Doctor._id or User._id
 * @returns {Promise<ObjectId|null>}
 */
const resolveDoctorId = async (idInput) => {
    if (!isValidIdInput(idInput)) return null;
    const byDoctorId = await Doctor.findById(idInput).select('_id').lean();
    if (byDoctorId) return byDoctorId._id;
    const byUserId = await Doctor.findOne({ user: idInput }).select('_id').lean();
    return byUserId ? byUserId._id : null;
};

/**
 * createPrescription
 * @description Handles operations for createPrescription. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createPrescription = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to create prescriptions.', error: 'Access Denied: Role not authorized to create prescriptions.' });
        }
        const { emrId, medicalRecord, patientId, patient, medications, instructions } = req.body;

        const targetEmrId = emrId || medicalRecord;
        const targetPatientInput = patientId || patient;

        if (!medications || !Array.isArray(medications) || medications.length === 0) {
            return res.status(400).json({ success: false, message: 'Medications array is required and must contain at least one item' , error: 'Medications array is required and must contain at least one item'  });
        }

        for (const med of medications) {
            if (!med.name || !med.dosage || !med.frequency || !med.duration) {
                return res.status(400).json({ success: false, message: 'Each medication must have name, dosage, frequency, and duration' , error: 'Each medication must have name, dosage, frequency, and duration'  });
            }
        }

        if (!targetEmrId && !targetPatientInput) {
            return res.status(400).json({ success: false, message: 'Valid Patient or EMR reference is required' , error: 'Valid Patient or EMR reference is required'  });
        }

        // 1. Identifier FORMAT (400) — no database access yet. A supplied patient reference is always validated; it is
        // never silently ignored in favour of the EMR.
        if (targetPatientInput && !isValidIdInput(targetPatientInput)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        if (targetEmrId && !isValidIdInput(targetEmrId)) {
            return res.status(400).json({ success: false, message: 'Invalid EMR identifier', error: 'Invalid EMR identifier' });
        }

        let resolvedPatientId = null;

        // 2. A NAMED patient: AUTHORIZATION first (before any existence lookup), then resolve the EXISTING patient (never
        // creates one), then authorize again against the canonical Patient id.
        if (targetPatientInput) {
            if (!(await canWritePatient(req.user, targetPatientInput))) {
                return denyWrite(res, 'create prescriptions');
            }
            resolvedPatientId = await resolvePatientId(targetPatientInput);
            if (!resolvedPatientId) {
                return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
            }
            if (!(await canWritePatient(req.user, resolvedPatientId))) {
                return denyWrite(res, 'create prescriptions');
            }
        }

        // 3. An EMR must exist AND belong to the same patient. With no patient named, the EMR's OWN patient is the
        // subject and the caller is authorized against THAT patient; an EMR can never override a named patient.
        if (targetEmrId) {
            const emrDoc = await MedicalRecord.findById(targetEmrId).select('patient').lean();
            if (!emrDoc) {
                return res.status(404).json({ success: false, message: 'EMR not found', error: 'EMR not found' });
            }
            if (resolvedPatientId) {
                if (!(await refBelongsToPatient(emrDoc.patient, resolvedPatientId))) {
                    return res.status(403).json({ success: false, message: 'Access Denied: The EMR does not belong to this patient.', error: 'Access Denied: The EMR does not belong to this patient.' });
                }
            } else {
                if (!(await canWritePatient(req.user, emrDoc.patient))) {
                    return denyWrite(res, 'create prescriptions');
                }
                resolvedPatientId = await resolvePatientId(emrDoc.patient);
                if (!resolvedPatientId) {
                    return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
                }
                if (!(await canWritePatient(req.user, resolvedPatientId))) {
                    return denyWrite(res, 'create prescriptions');
                }
            }
        }

        // 4. The prescribing doctor is the authenticated caller's EXISTING Doctor profile — for doctors and administrators
        // alike. A caller without one is refused (controlled 403); a profile is never auto-created as a side effect.
        const resolvedDoctorId = await resolveDoctorId(req.user._id);
        if (!resolvedDoctorId) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create prescriptions.', error: 'Access Denied: A Doctor profile is required to create prescriptions.' });
        }

        // Generate SHA-256 Digital Signature Hash
        const signaturePayload = `${resolvedPatientId}|${resolvedDoctorId}|${targetEmrId || 'NO_EMR'}|${JSON.stringify(medications)}|${Date.now()}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        const prescription = await Prescription.create({
            patient: resolvedPatientId,
            doctor: resolvedDoctorId,
            medicalRecord: targetEmrId || undefined,
            medications,
            instructions,
            digitalSignatureHash,
        });

        const populatedPrescription = await Prescription.findById(prescription._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .lean();

        // Store Audit Log for CREATED action
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: digitalSignatureHash,
            details: { medicationsCount: medications.length, patientId: resolvedPatientId }
        });

        res.status(201).json({
            success: true,
            message: 'Prescription created and digitally signed successfully',

            data: {
                prescription: populatedPrescription
            }
        });
    } catch (error) {
        console.error('Error in createPrescription:', error);
        next(error);
    }
};

/**
 * getAllPrescriptions
 * @description Handles operations for getAllPrescriptions. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllPrescriptions = async (req, res, next) => {
    try {
        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy enforced by createPrescription
        // (this file) and by getMedicalRecord / updateMedicalRecord / getPatientEMRs (Steps 70-72). A Consent's `grantedTo`
        // matches the caller's User id alone and does not itself prove a Doctor profile exists. A profile is never
        // auto-created here either. Placed BEFORE the role dispatch below so it covers every doctor-reachable branch of
        // this handler (both the ?patientId branch and the no-query "list my consented patients" branch). Patient
        // self-access and admin/hospital_admin access (below) are role-gated separately and are unaffected.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view prescriptions.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        let filter = {};
        let mustVerify = false;

        if (req.user.role === 'general_user') {
            // A patient sees ONLY their own prescriptions: identity comes from the session, never from the query.
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (isAdminRole(req.user)) {
            // Existing administrative behaviour (unchanged).
            if (req.query.patientId) {
                if (!isValidIdInput(req.query.patientId)) {
                    return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
                }
                const pId = await resolvePatientId(req.query.patientId);
                if (!pId) {
                    return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
                }
                filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
            }
        } else if (req.query.patientId) {
            // Doctor / other roles: format check, then AUTHORIZATION (before any existence lookup), then resolution.
            if (!isValidIdInput(req.query.patientId)) {
                return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
            }
            if (!(await canReadPatient(req.user, req.query.patientId))) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view prescriptions.', error: 'Access Denied: Patient active consent is required to view prescriptions.' });
            }
            const pId = await resolvePatientId(req.query.patientId);
            if (!pId) {
                return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
            }
            filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
            mustVerify = true;
        } else if (req.user.role === 'doctor') {
            // Consent is the ONLY source of a doctor's access. An assignment is NOT consent, so it is never consulted.
            const allowedPatientIds = await consentedPatientIdsForDoctor(req.user);
            if (allowedPatientIds.length === 0) {
                await logAudit({ req, action: 'VIEWED', resource: 'Prescription', details: { count: 0 } });
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            mustVerify = true;
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to list prescriptions.', error: 'Access Denied: Role not authorized to list prescriptions.' });
        }

        let prescriptions = await Prescription.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Defense in depth: a non-admin requester only ever receives records whose patient canReadPatient() allows.
        if (mustVerify) prescriptions = await keepAuthorized(req.user, prescriptions);

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            details: { count: prescriptions.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: prescriptions });
    } catch (error) {
        console.error('Error in getAllPrescriptions:', error);
        next(error);
    }
};

/**
 * getPrescriptionsByEmr
 * @description Handles operations for getPrescriptionsByEmr. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPrescriptionsByEmr = async (req, res, next) => {
    try {
        // Doctor-profile requirement (see getAllPrescriptions above for the full rationale). Placed first, before any
        // database lookup, since it depends only on the caller's identity.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view prescriptions.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        // Authorize against the patient(s) the data ACTUALLY belongs to — the EMR's patient and each prescription's own
        // patient — never against anything the client supplied. Nothing is populated/returned until this is settled.
        const emrDoc = await MedicalRecord.findById(req.params.emrId).select('patient').lean();
        const candidates = await Prescription.find({ medicalRecord: req.params.emrId }).select('_id patient').lean();
        if (emrDoc && !(await canReadPatient(req.user, emrDoc.patient))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view prescriptions.', error: 'Access Denied: Patient active consent is required to view prescriptions.' });
        }
        const allowed = await keepAuthorized(req.user, candidates);
        if (!emrDoc && candidates.length > 0 && allowed.length === 0) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view prescriptions.', error: 'Access Denied: Patient active consent is required to view prescriptions.' });
        }

        const prescriptions = await Prescription.find({ _id: { $in: allowed.map(p => p._id) } })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: req.params.emrId,
            details: { type: 'get_by_emr', count: prescriptions.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: prescriptions });
    } catch (error) {
        console.error('Error in getPrescriptionsByEmr:', error);
        next(error);
    }
};

/**
 * getPrescriptionsByPatient
 * @description Handles operations for getPrescriptionsByPatient. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPrescriptionsByPatient = async (req, res, next) => {
    try {
        if (!isValidIdInput(req.params.patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        // Doctor-profile requirement (see getAllPrescriptions above for the full rationale).
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view prescriptions.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        // Authorization BEFORE any existence lookup, so an unauthorized caller cannot tell whether the patient exists.
        if (!(await canReadPatient(req.user, req.params.patientId))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view prescriptions.', error: 'Access Denied: Patient active consent is required to view prescriptions.' });
        }
        const pId = await resolvePatientId(req.params.patientId);
        if (!pId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }
        const prescriptions = await Prescription.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: req.params.patientId,
            details: { type: 'get_by_patient', count: prescriptions.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: prescriptions });
    } catch (error) {
        console.error('Error in getPrescriptionsByPatient:', error);
        next(error);
    }
};

/**
 * getPrescriptionById
 * @description Handles operations for getPrescriptionById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPrescriptionById = async (req, res, next) => {
    try {
        // Doctor-profile requirement (see getAllPrescriptions above for the full rationale). Placed first, before any
        // database lookup, since it depends only on the caller's identity.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view prescriptions.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        // Authorize against the patient the RECORD belongs to, before loading/populating the full record.
        const head = await Prescription.findById(req.params.id).select('patient').lean();
        if (!head) {
            return res.status(404).json({ success: false, message: 'Prescription not found' , error: 'Prescription not found'  });
        }
        if (!(await canReadPatient(req.user, head.patient))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this prescription.', error: 'Access Denied: Patient active consent is required to view this prescription.' });
        }

        const prescription = await Prescription.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate')
            .lean();

        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found' , error: 'Prescription not found'  });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: prescription.digitalSignatureHash,
            details: { status: prescription.status }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: prescription });
    } catch (error) {
        console.error('Error in getPrescriptionById:', error);
        next(error);
    }
};

/**
 * updatePrescription
 * @description Handles operations for updatePrescription. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updatePrescription = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to update prescriptions.', error: 'Access Denied: Role not authorized to update prescriptions.' });
        }
        if (!isValidIdInput(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid prescription identifier', error: 'Invalid prescription identifier' });
        }
        const { medications, instructions, status } = req.body;

        // Authorize against the patient the RECORD actually belongs to, before anything in the body is trusted or applied.
        const head = await Prescription.findById(req.params.id).select('patient doctor medicalRecord').lean();
        if (!head) {
            return res.status(404).json({ success: false, message: 'Prescription not found' , error: 'Prescription not found'  });
        }
        if (!(await canWritePatient(req.user, head.patient))) {
            return denyWrite(res, 'update this prescription');
        }
        const immutableError = await immutableFieldError(req.body, head);
        if (immutableError) {
            return res.status(immutableError.status).json({ success: false, message: immutableError.message, error: immutableError.message });
        }

        let prescription = await Prescription.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found' , error: 'Prescription not found'  });
        }

        if (medications !== undefined) prescription.medications = medications;
        if (instructions !== undefined) prescription.instructions = instructions;
        if (status !== undefined) prescription.status = status;

        const signaturePayload = `${prescription.patient}|${prescription.doctor}|${prescription.medicalRecord || 'NO_EMR'}|${JSON.stringify(prescription.medications)}|${Date.now()}`;
        prescription.digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        await prescription.save();

        const updated = await Prescription.findById(prescription._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .populate('medicalRecord', 'diagnosis visitDate');

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'Prescription',
            resourceId: prescription._id,
            hash: prescription.digitalSignatureHash,
            details: { status: prescription.status }
        });

        res.status(200).json({
            success: true,
            message: 'Prescription updated successfully',

            data: {
                prescription: updated
            }
        });
    } catch (error) {
        console.error('Error in updatePrescription:', error);
        next(error);
    }
};

/**
 * deletePrescription
 * @description Handles operations for deletePrescription. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deletePrescription = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to delete prescriptions.', error: 'Access Denied: Role not authorized to delete prescriptions.' });
        }
        if (!isValidIdInput(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid prescription identifier', error: 'Invalid prescription identifier' });
        }
        const prescription = await Prescription.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found' , error: 'Prescription not found'  });
        }
        // Authorize against the patient the RECORD actually belongs to (never the author, never the caller's claim) BEFORE deleting.
        if (!(await canWritePatient(req.user, prescription.patient))) {
            return denyWrite(res, 'delete this prescription');
        }

        const hash = prescription.digitalSignatureHash;
        await Prescription.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'Prescription',
            resourceId: req.params.id,
            hash,
            details: { type: 'delete_prescription' }
        });

        res.status(200).json({
            success: true,
            message: 'Prescription deleted successfully',
            data: {}
        });
    } catch (error) {
        console.error('Error in deletePrescription:', error);
        next(error);
    }
};
