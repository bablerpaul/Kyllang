const LabReport = require('../../../models/LabReport');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');
const {
    INVESTIGATION_CATEGORIES,
    ALL_TEST_CATEGORIES,
    REPORT_DETAIL_KEYS,
    categoryForTestCategory,
} = require('./labInvestigationCatalog');

const isAdminRole = (user) => user.role === 'admin' || user.role === 'hospital_admin';

/**
 * canReadPatient
 * @description The ONE read-authorization decision for a patient's lab data: the patient themselves, an administrator, or
 * a requester holding an ACTIVE, UNEXPIRED Consent for that patient — all decided by hasActiveConsent. Assignments
 * (Patient.assignedDoctors / doctor.assignedPatients), record authorship and names never grant access. A record with no
 * patient reference is readable by administrators only (never an undefined id into a consent query).
 * @param {Object} user - req.user
 * @param {*} patientRef - Patient._id (or legacy User._id) taken from the RECORD / route being read
 * @returns {Promise<boolean>}
 */
const canReadPatient = async (user, patientRef) => {
    if (!patientRef) return isAdminRole(user);
    return hasActiveConsent({ patientInput: patientRef, requestingUser: user, requiredScope: 'lab_reports' });
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
            consentScopeFilter('lab_reports')
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
        const curr = (key === 'patient' || key === 'patientId') ? [current.patient] : [current.doctor, current.orderedBy];
        if (!same(v, ...curr)) return { status: 400, message: 'Patient and doctor ownership of a record cannot be changed.' };
    }
    for (const key of ['visit', 'visitId', 'medicalRecord', 'emrId']) {
        const v = body[key];
        if (v === undefined) continue;
        if (!isValidIdInput(v)) return { status: 400, message: `Invalid ${key} identifier` };
        if (same(v, current.visit, current.medicalRecord)) continue;
        const exists = await MedicalRecord.findById(v).select('_id').lean();
        if (!exists) return { status: 404, message: 'Visit / EMR not found' };
        return { status: 400, message: 'A record cannot be re-linked to a different visit / EMR.' };
    }
    return null;
};

const RESULT_FLAGS = ['normal', 'high', 'low', 'critical'];
const MAX_RESULT_ROWS = 100;
const MAX_TEXT_LENGTH = 10000;
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalarText = (v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/**
 * validateReportContent
 * @description Shape validation for the clinical CONTENT of a create/update body (T10-L7), so malformed input is answered
 * with a controlled 400 instead of surfacing as a Mongoose ValidationError / 500. Purely syntactic (no database access) and
 * grants nothing — authorization is decided separately. Only fields present in the body are checked (update is partial);
 * `effectiveTestCategory` is the category the record will have afterwards (body value, else the stored one).
 * Returns { error: { status, message } } or { values } where `values` holds the normalized fields that were supplied.
 */
const validateReportContent = (body, effectiveTestCategory) => {
    const bad = (message) => ({ error: { status: 400, message } });
    const values = {};

    if (body.testCategory !== undefined && !ALL_TEST_CATEGORIES.includes(body.testCategory)) {
        return bad(`testCategory must be one of: ${ALL_TEST_CATEGORIES.join(', ')}`);
    }
    // investigationCategory is derived from testCategory by the model; a supplied value may only confirm it.
    if (body.investigationCategory !== undefined && body.investigationCategory !== null && body.investigationCategory !== '') {
        if (!INVESTIGATION_CATEGORIES.includes(body.investigationCategory)) {
            return bad(`investigationCategory must be one of: ${INVESTIGATION_CATEGORIES.join(', ')}`);
        }
        if (categoryForTestCategory(effectiveTestCategory) !== body.investigationCategory) {
            return bad(`testCategory '${effectiveTestCategory}' does not belong to investigationCategory '${body.investigationCategory}'`);
        }
    }
    if (body.testName !== undefined && (typeof body.testName !== 'string' || !body.testName.trim())) {
        return bad('testName must be a non-empty string');
    }

    if (body.reportDate !== undefined) {
        if (body.reportDate === null || body.reportDate === '') {
            values.reportDate = undefined;
        } else {
            const d = new Date(body.reportDate);
            if (typeof body.reportDate === 'object' || Number.isNaN(d.getTime())) return bad('reportDate must be a valid date');
            values.reportDate = d;
        }
    }

    if (body.results !== undefined) {
        if (!Array.isArray(body.results)) return bad('results must be an array');
        if (body.results.length > MAX_RESULT_ROWS) return bad(`results may contain at most ${MAX_RESULT_ROWS} entries`);
        const rows = [];
        for (const r of body.results) {
            if (!isPlainObject(r)) return bad('Each result entry must be an object');
            if (!isScalarText(r.parameter) || !String(r.parameter).trim()) return bad('Each result entry requires a parameter name');
            if (!isScalarText(r.value) || !String(r.value).trim()) return bad(`Result '${r.parameter}' requires a value`);
            for (const k of ['unit', 'referenceRange']) {
                if (r[k] !== undefined && r[k] !== null && !isScalarText(r[k])) return bad(`Result '${r.parameter}' has an invalid ${k}`);
            }
            if (r.flag !== undefined && r.flag !== null && r.flag !== '' && !RESULT_FLAGS.includes(r.flag)) {
                return bad(`Result flag must be one of: ${RESULT_FLAGS.join(', ')}`);
            }
            const row = { parameter: String(r.parameter).trim(), value: String(r.value).trim() };
            if (r.unit !== undefined && r.unit !== null && String(r.unit).trim()) row.unit = String(r.unit).trim();
            if (r.referenceRange !== undefined && r.referenceRange !== null && String(r.referenceRange).trim()) row.referenceRange = String(r.referenceRange).trim();
            if (r.flag) row.flag = r.flag;
            if (Object.values(row).some(v => typeof v === 'string' && v.length > MAX_TEXT_LENGTH)) return bad('Result entry is too long');
            rows.push(row);
        }
        values.results = rows;
    }

    if (body.reportDetails !== undefined) {
        if (body.reportDetails === null) {
            values.reportDetails = {};
        } else {
            if (!isPlainObject(body.reportDetails)) return bad('reportDetails must be an object');
            const details = {};
            for (const [k, v] of Object.entries(body.reportDetails)) {
                if (!REPORT_DETAIL_KEYS.includes(k)) return bad(`reportDetails.${k} is not a supported field (allowed: ${REPORT_DETAIL_KEYS.join(', ')})`);
                if (v === undefined || v === null || v === '') continue;
                if (typeof v !== 'string') return bad(`reportDetails.${k} must be a string`);
                if (v.length > MAX_TEXT_LENGTH) return bad(`reportDetails.${k} is too long`);
                if (v.trim()) details[k] = v.trim();
            }
            values.reportDetails = details;
        }
    }

    if (body.overallSummary !== undefined && body.overallSummary !== null && typeof body.overallSummary !== 'string') {
        return bad('overallSummary must be a string');
    }
    return { values };
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
 * createLabReport
 * @description Handles operations for createLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createLabReport = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to create lab reports.', error: 'Access Denied: Role not authorized to create lab reports.' });
        }
        const { patientId, patient, testCategory, testName, overallSummary, pdfUrl, fileUrl, visitId, visit, medicalRecord, status } = req.body;

        const targetPatientInput = patientId || patient;
        const targetVisitInput = visitId || visit || medicalRecord;

        if (!targetPatientInput || !testCategory || !testName) {
            return res.status(400).json({ success: false, message: 'Patient reference, test category, and test name are required' , error: 'Patient reference, test category, and test name are required'  });
        }

        // Content SHAPE (400) — category/type/test, results rows and narrative sections. No database access.
        const content = validateReportContent(req.body, testCategory);
        if (content.error) {
            return res.status(content.error.status).json({ success: false, message: content.error.message, error: content.error.message });
        }
        const { results, reportDetails, reportDate } = content.values;

        // 1. Identifier FORMAT (400) — no database access yet.
        if (!isValidIdInput(targetPatientInput)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        if (targetVisitInput && !isValidIdInput(targetVisitInput)) {
            return res.status(400).json({ success: false, message: 'Invalid visit identifier', error: 'Invalid visit identifier' });
        }

        // 2. AUTHORIZATION against the named patient BEFORE any existence lookup (no oracle for unauthorized callers).
        if (!(await canWritePatient(req.user, targetPatientInput))) {
            return denyWrite(res, 'create lab reports');
        }

        // 3. Resolve the EXISTING patient (never creates one), then authorize again against the canonical Patient id.
        const resolvedPatientId = await resolvePatientId(targetPatientInput);
        if (!resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }
        if (!(await canWritePatient(req.user, resolvedPatientId))) {
            return denyWrite(res, 'create lab reports');
        }

        // 4. A visit/EMR must exist AND belong to this same patient; it can never override or widen the patient.
        if (targetVisitInput) {
            const visitDoc = await MedicalRecord.findById(targetVisitInput).select('patient').lean();
            if (!visitDoc) {
                return res.status(404).json({ success: false, message: 'Visit / EMR not found', error: 'Visit / EMR not found' });
            }
            if (!(await refBelongsToPatient(visitDoc.patient, resolvedPatientId))) {
                return res.status(403).json({ success: false, message: 'Access Denied: The visit / EMR does not belong to this patient.', error: 'Access Denied: The visit / EMR does not belong to this patient.' });
            }
        }

        // 5. The ordering doctor is the authenticated caller's EXISTING Doctor profile — for doctors and administrators
        // alike. A caller without one is refused (controlled 403); a profile is never auto-created as a side effect.
        const resolvedDoctorId = await resolveDoctorId(req.user._id);
        if (!resolvedDoctorId) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create lab reports.', error: 'Access Denied: A Doctor profile is required to create lab reports.' });
        }

        const reportContent = `${resolvedPatientId}|${resolvedDoctorId}|${testCategory}|${testName}|${JSON.stringify(results || [])}|${JSON.stringify(reportDetails || {})}|${reportDate ? reportDate.toISOString() : ''}|${Date.now()}`;
        const reportHash = crypto.createHash('sha256').update(reportContent).digest('hex');

        const labReport = await LabReport.create({
            patient: resolvedPatientId,
            orderedBy: resolvedDoctorId,
            doctor: resolvedDoctorId,
            medicalRecord: targetVisitInput || undefined,
            visit: targetVisitInput || undefined,
            testCategory,
            testName: testName.trim(),
            reportDate: reportDate || undefined,
            results: results || [],
            reportDetails: reportDetails || undefined,
            overallSummary: overallSummary || 'Lab test completed',
            pdfUrl: pdfUrl || fileUrl || undefined,
            fileUrl: fileUrl || pdfUrl || undefined,
            status: status || 'completed',
            reportHash,
        });

        const populatedReport = await LabReport.findById(labReport._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .lean();

        // Store Audit Log for CREATED action
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'LabReport',
            resourceId: labReport._id,
            hash: reportHash,
            details: { investigationCategory: labReport.investigationCategory, testCategory, testName, patientId: resolvedPatientId }
        });

        res.status(201).json({
            success: true,
            message: 'Lab Report created successfully',

            data: {
                labReport: populatedReport
            }
        });
    } catch (error) {
        console.error('Error in createLabReport:', error);
        next(error);
    }
};

/**
 * uploadLabReport
 * @description Upload an existing Lab Report document and link it to a new LabReport record.
 */
exports.uploadLabReport = async (req, res, next) => {
    try {
        const storageService = require('../secure-storage/services/storageService');
        const mongoose = require('mongoose');
        const fs = require('fs');
        
        if (!canWriteRole(req.user)) {
            if (req.file) await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to create lab reports.', error: 'Access Denied: Role not authorized to create lab reports.' });
        }
        
        const { patientId, testCategory, testName } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File is required', error: 'File is required' });
        }
        
        if (!patientId || !testCategory || !testName) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(400).json({ success: false, message: 'Patient reference, test category, and test name are required', error: 'Patient reference, test category, and test name are required' });
        }
        
        const content = validateReportContent(req.body, testCategory);
        if (content.error) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(content.error.status).json({ success: false, message: content.error.message, error: content.error.message });
        }
        
        if (!isValidIdInput(patientId)) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        
        if (!(await canWritePatient(req.user, patientId))) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return denyWrite(res, 'create lab reports');
        }
        
        const resolvedPatientId = await resolvePatientId(patientId);
        if (!resolvedPatientId) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }
        
        if (!(await canWritePatient(req.user, resolvedPatientId))) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return denyWrite(res, 'create lab reports');
        }
        
        const resolvedDoctorId = await resolveDoctorId(req.user._id);
        if (!resolvedDoctorId) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create lab reports.', error: 'Access Denied: A Doctor profile is required to create lab reports.' });
        }
        
        const labReportId = new mongoose.Types.ObjectId();
        
        let securePayloadResult;
        try {
            securePayloadResult = await storageService.uploadSecurePayload({
                filePath: req.file.path,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                patientId: resolvedPatientId,
                uploaderId: req.user._id,
                doctorId: resolvedDoctorId,
                documentType: 'LabReport',
                linkedLabReport: labReportId
            });
        } catch (err) {
            await fs.promises.unlink(req.file.path).catch(()=>{});
            throw err;
        }
        
        const { secureFile, ipfsCid, dataHash } = securePayloadResult;
        
        const rDate = content.values.reportDate;
        const reportContent = `${resolvedPatientId}|${resolvedDoctorId}|${testCategory}|${testName.trim()}|||${rDate ? rDate.toISOString() : ''}|${Date.now()}`;
        const reportHash = crypto.createHash('sha256').update(reportContent).digest('hex');
        
        const labReport = await LabReport.create({
            _id: labReportId,
            patient: resolvedPatientId,
            orderedBy: resolvedDoctorId,
            doctor: resolvedDoctorId,
            testCategory,
            testName: testName.trim(),
            reportDate: rDate || undefined,
            creationMode: 'upload',
            secureFile: secureFile._id,
            ipfsCid,
            status: 'completed',
            reportHash
        });
        
        const populatedReport = await LabReport.findById(labReport._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .lean();
            
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'LabReport',
            resourceId: labReport._id,
            hash: dataHash,
            details: { mode: 'upload', testCategory, testName, patientId: resolvedPatientId }
        });
        
        await logAudit({
            req,
            action: 'UPLOADED',
            resource: 'SecureFile',
            resourceId: secureFile._id,
            hash: dataHash,
            details: { type: 'lab_report_upload', labReportId: labReport._id, fileName: secureFile.fileName }
        });
        
        res.status(201).json({
            success: true,
            message: 'Lab Report uploaded successfully',
            data: { labReport: populatedReport }
        });
    } catch (error) {
        console.error('Error in uploadLabReport:', error);
        next(error);
    }
};

/**
 * getAllLabReports
 * @description Handles operations for getAllLabReports. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllLabReports = async (req, res, next) => {
    try {
        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy enforced by createLabReport
        // (this file) and by getMedicalRecord / updateMedicalRecord / getPatientEMRs (Steps 70-72). A Consent's `grantedTo`
        // matches the caller's User id alone and does not itself prove a Doctor profile exists. A profile is never
        // auto-created here either. Placed BEFORE the role dispatch below so it covers every doctor-reachable branch of
        // this handler (both the ?patientId branch and the no-query "list my consented patients" branch). Patient
        // self-access and admin/hospital_admin access (below) are role-gated separately and are unaffected.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view lab reports.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        let filter = {};
        let mustVerify = false;

        if (req.user.role === 'general_user') {
            // A patient sees ONLY their own reports: identity comes from the session, never from the query.
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
            } else if (req.query.testCategory) {
                filter.testCategory = req.query.testCategory;
            }
        } else if (req.query.patientId) {
            // Doctor / other roles: format check, then AUTHORIZATION (before any existence lookup), then resolution.
            if (!isValidIdInput(req.query.patientId)) {
                return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
            }
            if (!(await canReadPatient(req.user, req.query.patientId))) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view lab reports.', error: 'Access Denied: Patient active consent is required to view lab reports.' });
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
                await logAudit({ req, action: 'VIEWED', resource: 'LabReport', details: { count: 0 } });
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            if (req.query.testCategory) filter.testCategory = req.query.testCategory;
            mustVerify = true;
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to list lab reports.', error: 'Access Denied: Role not authorized to list lab reports.' });
        }

        let reports = await LabReport.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Defense in depth: a non-admin requester only ever receives records whose patient canReadPatient() allows.
        if (mustVerify) reports = await keepAuthorized(req.user, reports);

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            details: { count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getAllLabReports:', error);
        next(error);
    }
};

/**
 * getLabReportsByVisit
 * @description Handles operations for getLabReportsByVisit. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportsByVisit = async (req, res, next) => {
    try {
        // Doctor-profile requirement (see getAllLabReports above for the full rationale). Placed first, before any
        // database lookup, since it depends only on the caller's identity.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view lab reports.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        const { visitId } = req.params;
        const visitFilter = { $or: [{ visit: visitId }, { medicalRecord: visitId }] };

        // Authorize against the patient(s) the data ACTUALLY belongs to — the visit's EMR patient and each report's
        // own patient — never against anything the client supplied. Nothing is populated/returned until this is settled.
        const visitEmr = await MedicalRecord.findById(visitId).select('patient').lean();
        const candidates = await LabReport.find(visitFilter).select('_id patient').lean();
        if (visitEmr && !(await canReadPatient(req.user, visitEmr.patient))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view lab reports.', error: 'Access Denied: Patient active consent is required to view lab reports.' });
        }
        const allowed = await keepAuthorized(req.user, candidates);
        if (!visitEmr && candidates.length > 0 && allowed.length === 0) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view lab reports.', error: 'Access Denied: Patient active consent is required to view lab reports.' });
        }

        const reports = await LabReport.find({ _id: { $in: allowed.map(r => r._id) } })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: visitId,
            details: { type: 'get_by_visit', count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getLabReportsByVisit:', error);
        next(error);
    }
};

/**
 * getLabReportsByPatient
 * @description Handles operations for getLabReportsByPatient. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportsByPatient = async (req, res, next) => {
    try {
        if (!isValidIdInput(req.params.patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        // Doctor-profile requirement (see getAllLabReports above for the full rationale).
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view lab reports.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        // Authorization BEFORE any existence lookup, so an unauthorized caller cannot tell whether the patient exists.
        if (!(await canReadPatient(req.user, req.params.patientId))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view lab reports.', error: 'Access Denied: Patient active consent is required to view lab reports.' });
        }
        const pId = await resolvePatientId(req.params.patientId);
        if (!pId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }
        const reports = await LabReport.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: req.params.patientId,
            details: { type: 'get_by_patient', count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getLabReportsByPatient:', error);
        next(error);
    }
};

/**
 * getLabReportById
 * @description Handles operations for getLabReportById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportById = async (req, res, next) => {
    try {
        // Doctor-profile requirement (see getAllLabReports above for the full rationale). Placed first, before any
        // database lookup, since it depends only on the caller's identity.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view lab reports.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }
        // Authorize against the patient the RECORD belongs to, before loading/populating the full record.
        const head = await LabReport.findById(req.params.id).select('patient').lean();
        if (!head) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
        }
        if (!(await canReadPatient(req.user, head.patient))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this lab report.', error: 'Access Denied: Patient active consent is required to view this lab report.' });
        }

        const report = await LabReport.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .lean();

        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: report._id,
            hash: report.reportHash,
            details: { testCategory: report.testCategory, testName: report.testName }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: report });
    } catch (error) {
        console.error('Error in getLabReportById:', error);
        next(error);
    }
};

/**
 * updateLabReport
 * @description Handles operations for updateLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updateLabReport = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to update lab reports.', error: 'Access Denied: Role not authorized to update lab reports.' });
        }
        if (!isValidIdInput(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid lab report identifier', error: 'Invalid lab report identifier' });
        }
        const { testCategory, testName, overallSummary, pdfUrl, fileUrl, status } = req.body;

        // Authorize against the patient the RECORD actually belongs to, before anything in the body is trusted or applied.
        const head = await LabReport.findById(req.params.id).select('patient orderedBy doctor visit medicalRecord testCategory').lean();
        if (!head) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
        }
        if (!(await canWritePatient(req.user, head.patient))) {
            return denyWrite(res, 'update this lab report');
        }
        const immutableError = await immutableFieldError(req.body, head);
        if (immutableError) {
            return res.status(immutableError.status).json({ success: false, message: immutableError.message, error: immutableError.message });
        }
        const content = validateReportContent(req.body, testCategory !== undefined ? testCategory : head.testCategory);
        if (content.error) {
            return res.status(content.error.status).json({ success: false, message: content.error.message, error: content.error.message });
        }

        let report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
        }

        if (testCategory !== undefined) report.testCategory = testCategory;
        if (testName !== undefined) report.testName = testName.trim();
        if ('reportDate' in content.values) report.reportDate = content.values.reportDate;
        if (content.values.results !== undefined) report.results = content.values.results;
        if (content.values.reportDetails !== undefined) report.reportDetails = content.values.reportDetails;
        if (overallSummary !== undefined) report.overallSummary = overallSummary;
        if (pdfUrl !== undefined) report.pdfUrl = pdfUrl;
        if (fileUrl !== undefined) report.fileUrl = fileUrl;
        if (status !== undefined) report.status = status;

        const reportContent = `${report.patient}|${report.orderedBy}|${report.testCategory}|${report.testName}|${JSON.stringify(report.results)}|${JSON.stringify(report.reportDetails || {})}|${report.reportDate ? report.reportDate.toISOString() : ''}|${Date.now()}`;
        report.reportHash = crypto.createHash('sha256').update(reportContent).digest('hex');

        await report.save();

        const updated = await LabReport.findById(report._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .lean();

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'LabReport',
            resourceId: report._id,
            hash: report.reportHash,
            details: { investigationCategory: report.investigationCategory, testCategory: report.testCategory, status: report.status }
        });

        res.status(200).json({
            success: true,
            message: 'Lab Report updated successfully',

            data: {
                labReport: updated
            }
        });
    } catch (error) {
        console.error('Error in updateLabReport:', error);
        next(error);
    }
};

/**
 * deleteLabReport
 * @description Handles operations for deleteLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deleteLabReport = async (req, res, next) => {
    try {
        if (!canWriteRole(req.user)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to delete lab reports.', error: 'Access Denied: Role not authorized to delete lab reports.' });
        }
        if (!isValidIdInput(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid lab report identifier', error: 'Invalid lab report identifier' });
        }
        const report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
        }
        // Authorize against the patient the RECORD actually belongs to (never the author, never the caller's claim) BEFORE deleting.
        if (!(await canWritePatient(req.user, report.patient))) {
            return denyWrite(res, 'delete this lab report');
        }

        const reportHash = report.reportHash;
        await LabReport.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'LabReport',
            resourceId: req.params.id,
            hash: reportHash,
            details: { type: 'delete_lab_report' }
        });

        res.status(200).json({
            success: true,
            message: 'Lab Report deleted successfully',
            data: {}
        });
    } catch (error) {
        console.error('Error in deleteLabReport:', error);
        next(error);
    }
};
