const { MedicalRecord, Appointment, Prescription, LabReport, User, AuditLog } = require('../../models');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const mongoose = require('mongoose');
const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');

// Same 24-hex-ObjectId / ObjectId-instance check used by prescriptionController.js, so a malformed patientId
// answers a clean 400 instead of a Mongoose CastError surfacing as an unhandled 500.
const isValidIdInput = (v) =>
    (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)) ||
    (!!v && typeof v === 'object' && (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID'));

async function isDoctorAssigned(reqUser, patientId) {
    if (reqUser.role !== 'doctor') return false;
    const Doctor = require('../../../models/Doctor');
    const doctorProfile = await Doctor.findOne({ user: reqUser._id }).lean();
    const pidString = (patientId && patientId._id) ? patientId._id.toString() : (patientId ? patientId.toString() : '');
    return doctorProfile && doctorProfile.assignedPatients && doctorProfile.assignedPatients.some(id => id && id.toString() === pidString);
}


// ── Read authorization for the legacy lab-report / prescription lists (same semantics as the dedicated lab/prescription
// module routes): patient = own records (session identity); doctor = ACTIVE, UNEXPIRED consent only; administrators =
// existing broad access; every other role = denied. Assignments, record authorship and names never grant access.
const isAdminRole = (user) => user.role === 'admin' || user.role === 'hospital_admin';

/**
 * canReadPatientRecords
 * @description The ONE read-authorization decision for a patient's data: the patient themselves, an administrator, or a
 * requester holding an ACTIVE, UNEXPIRED Consent for that patient — all decided by hasActiveConsent. A record with no
 * patient reference is readable by administrators only (never an undefined id into a consent query).
 */
const canReadPatientRecords = async (user, patientRef, requiredScope) => {
    if (!patientRef) return isAdminRole(user);
    return hasActiveConsent({ patientInput: patientRef, requestingUser: user, requiredScope });
};

/**
 * consentedPatientIdsForDoctor
 * @description Exact consent-derived patient ids for a doctor: active, unexpired Consent granted to THIS doctor (by user
 * id or Doctor profile id). Assignments are never consulted.
 */
const consentedPatientIdsForDoctor = async (user, requiredScope) => {
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
            consentScopeFilter(requiredScope)
        ]
    });
    return [...new Set(activeConsents.map(c => (c.patient ? c.patient.toString() : '')).filter(Boolean))];
};

/**
 * keepAuthorizedRecords
 * @description Defense in depth for broad queries: keep only records whose ACTUAL patient canReadPatientRecords() allows
 * (one verdict per distinct patient). A record with no resolvable patient is dropped.
 */
const keepAuthorizedRecords = async (user, records, requiredScope) => {
    const verdicts = new Map();
    const out = [];
    for (const r of records) {
        const pid = r.patient && r.patient._id ? String(r.patient._id) : (r.patient ? String(r.patient) : null);
        if (!pid) continue;
        if (!verdicts.has(pid)) verdicts.set(pid, await canReadPatientRecords(user, pid, requiredScope));
        if (verdicts.get(pid)) out.push(r);
    }
    return out;
};

/**
 * getMedicalRecord
 * @description Handles operations for getMedicalRecord. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getMedicalRecord = async (req, res, next) => {
    try {
        console.log("===> HITTING getMedicalRecord", req.originalUrl, req.params);
        let userId = req.params.patientId || req.user._id;

        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy enforced by every other
        // Doctor-module operation (createEMR / uploadPrescription / addClinicalNotes / updatePatientDiagnosis /
        // updateMedicalRecord, Step 70). A Consent's `grantedTo` matches the caller's User id alone and does not itself
        // prove a Doctor profile exists: a patient can grant consent to any User account with role 'doctor' that is in
        // their assignedPatients list (see resolveAssignedDoctor / adminController.assignDoctor), neither of which
        // requires a Doctor profile to exist. A profile is never auto-created here either. hospital_admin's existing
        // broad access (via hasActiveConsent's own admin bypass) is unchanged.
        if (req.user && req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to access this record.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        const isAllowed = (await isDoctorAssigned(req.user, userId)) || await hasActiveConsent({ patientInput: userId, requestingUser: req.user, requiredScope: 'medical_records'  });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this record' });
        }

        const patientDoc = await Patient.findOne({ $or: [{ _id: userId }, { user: userId }] }).populate('user', 'name email').lean();
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        // Find the latest medical record for this patient (for top-level vitals compatibility)
        let record = await MedicalRecord.findOne({ patient: patientDoc._id }).sort({ visitDate: -1 }).lean();
        
        // Find ALL medical records for the patient (EMR History)
        const emrHistory = await MedicalRecord.find({ patient: patientDoc._id })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 })
            .lean();

        // Merge patient profile data with medical record data
        const responseData = {
            ...record,
            bloodGroup: patientDoc.bloodGroup,
            allergies: patientDoc.allergies || [],
            chronicConditions: patientDoc.chronicConditions || [],
            vitals: record?.vitals || record?.vitalSigns || {},
            medicalHistory: record?.medicalHistory || [],
            emrHistory: emrHistory || []
        };

        res.status(200).json({ success: true, message: 'Operation successful', data: responseData });
    } catch (err) {
        next(err);
    }
};

/**
 * updateMedicalRecord
 * @description Handles operations for updateMedicalRecord. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updateMedicalRecord = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const { bloodGroup, allergies, chronicConditions, vitals, medicalHistory } = req.body;

        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy already enforced by every
        // other Doctor-module write (createEMR / uploadPrescription / addClinicalNotes / updatePatientDiagnosis). A
        // Consent's `grantedTo` matches the caller's User id alone and does not itself prove a Doctor profile exists: a
        // patient can grant consent to any User account with role 'doctor' that is in their assignedPatients list (see
        // resolveAssignedDoctor / adminController.assignDoctor), neither of which requires a Doctor profile to exist. A
        // profile is never auto-created here either. hospital_admin's existing broad access (via hasActiveConsent's own
        // admin bypass) is unchanged — this handler never attributes a doctor on the record, so no profile id is needed for it.
        if (req.user && req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to update this record.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        const isAllowed = (await isDoctorAssigned(req.user, patientId)) || await hasActiveConsent({ patientInput: patientId, requestingUser: req.user, requiredScope: 'medical_records'  });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this record' });
        }

        const patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        const resolvedPatientId = patientDoc._id;

        let record = await MedicalRecord.findOne({ patient: resolvedPatientId });
        if (!record) {
            record = new MedicalRecord({ patient: resolvedPatientId });
        }

        if (bloodGroup) record.bloodGroup = bloodGroup;
        if (allergies) record.allergies = allergies;
        if (chronicConditions) record.chronicConditions = chronicConditions;
        if (vitals) record.vitals = { ...record.vitals, ...vitals };
        if (medicalHistory) record.medicalHistory = medicalHistory;

        await record.save();

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'update_medical_record', patientId }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: record });
    } catch (err) {
        next(err);
    }
};

/**
 * getAppointments
 * @description Handles operations for getAppointments. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAppointments = async (req, res, next) => {
    try {
        let filter = {};

        if (req.user.role === 'doctor') {
            // Appointment.doctor refs Doctor._id, not User._id
            const doctorDoc = await Doctor.findOne({ user: req.user._id }).select('_id');
            if (!doctorDoc) {
                return res.status(404).json({ success: false, message: 'Doctor profile not found for this account.' });
            }
            filter = { doctor: doctorDoc._id };
        } else if (req.user.role === 'general_user') {
            // Appointment.patient refs Patient._id, not User._id
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (!patientDoc) {
                return res.status(404).json({ success: false, message: 'Patient profile not found for this account.' });
            }
            filter = { patient: patientDoc._id };
        }
        // hospital_admin: filter stays {} — sees all appointments

        const appointments = await Appointment.find(filter)
            .populate({
                path: 'patient',
                select: 'dateOfBirth gender bloodGroup',
                populate: { path: 'user', select: 'name email' },
            })
            .populate({
                path: 'doctor',
                select: 'specialty licenseNumber department',
                populate: { path: 'user', select: 'name email' },
            })
            .sort({ appointmentDate: 1 })
            .lean();

        res.status(200).json({ success: true, message: 'Operation successful', data: appointments });
    } catch (err) {
        next(err);
    }
};

/**
 * createAppointment
 * @description Handles operations for createAppointment. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createAppointment = async (req, res, next) => {
    try {
        const { doctorId, patientId, appointmentDate, timeSlot, reason } = req.body;

        // ── Doctors cannot book appointments as patients ──────────────────
        if (req.user.role === 'doctor') {
            return res.status(403).json({ success: false, message: 'Doctors cannot create patient appointments.' });
        }

        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate is required.' });
        }
        const apptDate = new Date(appointmentDate);
        if (isNaN(apptDate.getTime())) {
            return res.status(400).json({ success: false, message: 'appointmentDate is not a valid date.' });
        }
        // Compare using start-of-day UTC so a same-day booking is not rejected
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        if (apptDate < todayUtc) {
            return res.status(400).json({ success: false, message: 'appointmentDate cannot be in the past.' });
        }
        if (!timeSlot || !timeSlot.toString().trim()) {
            return res.status(400).json({ success: false, message: 'timeSlot is required.' });
        }
        if (!reason || !reason.toString().trim()) {
            return res.status(400).json({ success: false, message: 'reason is required.' });
        }

        // ── Resolve Patient ───────────────────────────────────────────────
        let resolvedPatientId;
        if (req.user.role === 'general_user') {
            // Find the Patient profile linked to this User account
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (!patientDoc) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient profile not found for this account. Please contact the administrator.',
                });
            }
            resolvedPatientId = patientDoc._id;
        } else if (req.user.role === 'hospital_admin') {
            // Admin must supply a valid patientId
            if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
                return res.status(400).json({ success: false, message: 'Admin must provide a valid patientId.' });
            }
            const patientDoc = await Patient.findById(patientId).select('_id');
            if (!patientDoc) {
                return res.status(404).json({ success: false, message: 'Patient not found.' });
            }
            resolvedPatientId = patientDoc._id;
        } else {
            return res.status(403).json({ success: false, message: 'Not authorized to create appointments.' });
        }

        let finalDoctorId = doctorId;

        // ── AUTOMATIC DOCTOR ASSIGNMENT ──────────────────────────────
        if (!finalDoctorId && req.user.role === 'general_user') {
            // Parse local date from timeSlot to find day of week
            // The string is passed directly
            const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = DAY_NAMES[apptDate.getUTCDay()]; // Use UTC day since apptDate is parsed as UTC above? Wait.
            // Let's parse strictly locally
            const localDateStr = appointmentDate;
            const [yStr, mStr, dStr] = localDateStr.split('-');
            const reqYear = parseInt(yStr, 10);
            const reqMonth = parseInt(mStr, 10) - 1;
            const reqDate = parseInt(dStr, 10);
            const dateObj = new Date(reqYear, reqMonth, reqDate);
            const localDayName = DAY_NAMES[dateObj.getDay()];

            const slotMatch = timeSlot.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (!slotMatch) return res.status(400).json({ success: false, message: 'timeSlot format is invalid.' });
            let slotHour = parseInt(slotMatch[1], 10);
            const slotMin  = parseInt(slotMatch[2], 10);
            const period   = slotMatch[3].toUpperCase();
            if (period === 'PM' && slotHour !== 12) slotHour += 12;
            if (period === 'AM' && slotHour === 12) slotHour  = 0;
            const slotMinutes = slotHour * 60 + slotMin;

            const allDoctors = await Doctor.find().populate('user', 'assignedPatients').lean();
            let eligibleDoctors = [];

            for (const doc of allDoctors) {
                const avail = doc.availability;
                const dayConfig = avail && avail[localDayName];
                if (!dayConfig || !dayConfig.enabled) continue;

                const [startH, startM] = dayConfig.startTime.split(':').map(Number);
                const [endH,   endM]   = dayConfig.endTime.split(':').map(Number);
                const startMinutes = startH * 60 + startM;
                const endMinutes   = endH   * 60 + endM;
                const duration = doc.appointmentDuration || 30;

                if (slotMinutes >= startMinutes && slotMinutes + duration <= endMinutes) {
                    eligibleDoctors.push(doc);
                }
            }

            const dayStart = new Date(reqYear, reqMonth, reqDate, 0, 0, 0, 0);
            const dayEnd = new Date(reqYear, reqMonth, reqDate, 23, 59, 59, 999);

            const booked = await Appointment.find({
                appointmentDate: { $gte: dayStart, $lte: dayEnd },
                timeSlot: timeSlot.trim(),
                status: { $in: ['scheduled', 'completed'] }
            }).select('doctor').lean();
            
            const bookedDocIds = new Set(booked.map(b => b.doctor.toString()));
            
            eligibleDoctors = eligibleDoctors.filter(d => !bookedDocIds.has(d._id.toString()));

            if (eligibleDoctors.length === 0) {
                return res.status(409).json({ success: false, message: 'No doctors are available for the selected time slot.' });
            }

            let preferredDocs = [];
            for (const doc of eligibleDoctors) {
                const assigned = doc.user?.assignedPatients || [];
                if (assigned.some(p => p.toString() === req.user._id.toString())) {
                    preferredDocs.push(doc);
                }
            }

            const candidatePool = preferredDocs.length > 0 ? preferredDocs : eligibleDoctors;

            const workloads = await Appointment.aggregate([
                { $match: { 
                    appointmentDate: { $gte: dayStart, $lte: dayEnd },
                    status: { $in: ['scheduled', 'completed'] },
                    doctor: { $in: candidatePool.map(d => d._id) }
                }},
                { $group: { _id: '$doctor', count: { $sum: 1 } } }
            ]);
            
            const workloadMap = new Map();
            workloads.forEach(w => workloadMap.set(w._id.toString(), w.count));

            for (const doc of candidatePool) {
                doc.workload = workloadMap.get(doc._id.toString()) || 0;
            }

            candidatePool.sort((a, b) => {
                if (a.workload !== b.workload) return a.workload - b.workload;
                return a._id.toString().localeCompare(b._id.toString());
            });

            finalDoctorId = candidatePool[0]._id;
        }

        if (!finalDoctorId || !mongoose.Types.ObjectId.isValid(finalDoctorId)) {
            return res.status(400).json({ success: false, message: 'A valid doctorId is required or no doctor is available.' });
        }

        // ── Validate Doctor ───────────────────────────────────────────────
        const doctorDoc = await Doctor.findById(finalDoctorId);
        if (!doctorDoc) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        // ── Double-booking check (application level) ──────────────────────
        // The partial unique index on the model also enforces this at DB level
        // but we check first to return a clean 409 instead of a MongoError.
        const existingAppointment = await Appointment.findOne({
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            status: { $in: ['scheduled', 'completed'] },
        });
        if (existingAppointment) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor. Please choose a different time.',
            });
        }

        // ── Create ────────────────────────────────────────────────────────
        const appointment = await Appointment.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            reason: reason.trim(),
        });

        res.status(201).json({ success: true, message: 'Appointment booked successfully.', data: appointment });
    } catch (err) {
        // Handle the DB-level unique index violation as a 409 too
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor.',
            });
        }
        next(err);
    }
};

/**
 * getPrescriptions
 * @description Handles operations for getPrescriptions. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPrescriptions = async (req, res, next) => {
    try {
        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy already enforced by
        // getMedicalRecord / updateMedicalRecord in this SAME file (Steps 70-71) and by the dedicated lab/prescription
        // read handlers (Step 73). A Consent's `grantedTo` matches the caller's User id alone and does not itself prove
        // a Doctor profile exists: a patient can grant consent to any User account with role 'doctor' that is in their
        // assignedPatients list (see resolveAssignedDoctor / adminController.assignDoctor), neither of which requires a
        // Doctor profile to exist. A profile is never auto-created here either. Placed BEFORE the role dispatch below so
        // it covers the doctor-reachable branch; patient self-access and admin/hospital_admin access are unaffected.
        if (req.user && req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view prescriptions.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        let filter = {};
        let mustVerify = false;
        if (req.user.role === 'general_user') {
            // A patient sees ONLY their own prescriptions. Identity comes from the SESSION (the Patient profile that
            // references this user); query parameters are never read. `patient` refs a Patient profile, not a User id.
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (isAdminRole(req.user)) {
            filter = {};   // existing broad administrative access (unchanged)
        } else if (req.user.role === 'doctor') {
            // Consent is the ONLY source of a doctor's access; the query itself is constrained to consented patients.
            const allowedPatientIds = await consentedPatientIdsForDoctor(req.user, 'prescriptions');
            if (allowedPatientIds.length === 0) {
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            mustVerify = true;
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to list prescriptions.' });
        }
        let prescriptions = await Prescription.find(filter)
            .populate({ path: 'patient', select: 'user', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', select: 'user specialty', populate: { path: 'user', select: 'name email' } })
            .sort({ createdAt: -1 })
            .lean();

        // Each returned record is authorized against its ACTUAL patient (defense in depth against mixed data).
        if (mustVerify) prescriptions = await keepAuthorizedRecords(req.user, prescriptions, 'prescriptions');

        // Patient/Doctor have no name/email of their own (those live on the linked User) — flatten the nested
        // populate back onto patient.name/doctor.name so the existing response shape is unchanged for callers.
        prescriptions = prescriptions.map((p) => ({
            ...p,
            patient: p.patient ? { _id: p.patient._id, name: p.patient.user?.name, email: p.patient.user?.email } : p.patient,
            doctor: p.doctor ? { _id: p.doctor._id, name: p.doctor.user?.name, specialty: p.doctor.specialty } : p.doctor,
        }));

        res.status(200).json({ success: true, message: 'Operation successful', data: prescriptions });
    } catch (err) {
        next(err);
    }
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
        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy enforced by
        // getPrescriptions/getLabReports in this SAME file (Steps 70-74) and by the dedicated lab/prescription write
        // handlers. A Consent's `grantedTo` matches the caller's User id alone and does not itself prove a Doctor
        // profile exists: a patient can grant consent to any User account with role 'doctor' that is in their
        // assignedPatients list (see resolveAssignedDoctor / adminController.assignDoctor), neither of which requires a
        // Doctor profile to exist. A profile is never auto-created here. Placed BEFORE the consent check and any write,
        // so a profile-less doctor creates nothing.
        // Resolved once, reused below for the stored `doctor` reference and the signature — never the raw User id
        // (Prescription.doctor is `ref: 'Doctor'`, matching prescriptionController.createPrescription /
        // doctorController.uploadPrescription).
        let doctorDoc = null;
        if (req.user && req.user.role === 'doctor') {
            doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create a prescription.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        const { patientId, medications, instructions } = req.body;

        if (!isValidIdInput(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }

        // Consent is the ONLY source of a doctor's access — same gate as prescriptionController.createPrescription /
        // doctorController.uploadPrescription. An assignment (Doctor.assignedPatients) is NOT consent and must never
        // authorize a write on its own.
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user, requiredScope: 'prescriptions' });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Not authorized to create a prescription for this patient' });
        }

        const patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        const resolvedPatientId = patientDoc._id;

        if (!doctorDoc) {
            doctorDoc = await Doctor.findOne({ user: req.user._id });
        }
        if (!doctorDoc) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create a prescription.', error: 'DOCTOR_PROFILE_REQUIRED' });
        }

        const crypto = require('crypto');
        const signatureString = `${resolvedPatientId}|${doctorDoc._id}|${JSON.stringify(medications)}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signatureString).digest('hex');

        const prescription = await Prescription.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            medications,
            instructions,
            digitalSignatureHash,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'issue_prescription', prescriptionId: prescription._id, patientId }
        });

        res.status(201).json({ success: true, message: 'Operation successful', data: prescription });
    } catch (err) {
        next(err);
    }
};

/**
 * getLabReports
 * @description Handles operations for getLabReports. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReports = async (req, res, next) => {
    try {
        // Doctor-profile requirement (see getPrescriptions above for the full rationale).
        if (req.user && req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view lab reports.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        let filter = {};
        let mustVerify = false;
        if (req.user.role === 'general_user') {
            // A patient sees ONLY their own lab reports. Identity comes from the SESSION (the Patient profile that
            // references this user); query parameters are never read. `patient` refs a Patient profile, not a User id.
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (isAdminRole(req.user)) {
            filter = {};   // existing broad administrative access (unchanged)
        } else if (req.user.role === 'doctor') {
            // Consent is the ONLY source of a doctor's access; the query itself is constrained to consented patients.
            const allowedPatientIds = await consentedPatientIdsForDoctor(req.user, 'lab_reports');
            if (allowedPatientIds.length === 0) {
                return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
            }
            filter = { patient: { $in: allowedPatientIds } };
            mustVerify = true;
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to list lab reports.' });
        }
        let reports = await LabReport.find(filter)
            .populate('orderedBy', 'name specialty')
            .sort({ createdAt: -1 })
            .lean();

        // Each returned record is authorized against its ACTUAL patient (defense in depth against mixed data).
        if (mustVerify) reports = await keepAuthorizedRecords(req.user, reports, 'lab_reports');

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (err) {
        next(err);
    }
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
        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — same policy/rationale as createPrescription
        // above and getLabReports in this file. Placed BEFORE the consent check and any write, so a profile-less doctor
        // creates nothing.
        if (req.user && req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create a lab report.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        const { patientId, testCategory, testName, resultsSummary } = req.body;

        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user, requiredScope: 'lab_reports' });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Not authorized to order a lab report for this patient' });
        }

        const patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        const resolvedPatientId = patientDoc._id;

        const report = await LabReport.create({
            patient: resolvedPatientId,
            orderedBy: req.user._id,
            testCategory,
            testName,
            resultsSummary,
        });

        res.status(201).json({ success: true, message: 'Operation successful', data: report });
    } catch (err) {
        next(err);
    }
};
