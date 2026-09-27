const User = require('../../../models/User');
const Doctor = require('../../../models/Doctor');
const Patient = require('../../../models/Patient');
const MedicalRecord = require('../../../models/MedicalRecord');
const Prescription = require('../../../models/Prescription');
const LabReport = require('../../../models/LabReport');
const Certificate = require('../../../models/Certificate');
const AuditLog = require('../../../models/AuditLog');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

const blockchainContract = require('../../../blockchain');
const Appointment = require('../../../models/Appointment');
const mongoose = require('mongoose');
// Reused, not reinvented: the same recursive key-sort canonicalization already established for EMR integrity hashing
// (see src/modules/emr/emrRecordController.js::canonicalizeEMRData, which fixed this exact class of bug there).
const { canonicalize } = require('../../utils/canonicalize');

/**
 * getAllDoctors
 * @description Retrieves all available doctors in the system
 */
exports.getAllDoctors = async (req, res, next) => {
    try {
        const doctors = await Doctor.find()
            .populate('user', 'name email')
            .lean();
        res.status(200).json({ success: true, message: 'Operation successful', data: doctors });
    } catch (error) {
        console.error('Error in getAllDoctors:', error);
        next(error);
    }
};

/**
 * generateToken
 * @description Handles operations for generateToken. Explains parameters, return values and usage.
 * @param {*} id - id parameter
 * @returns {*} Return value
 */
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

/**
 * registerDoctor
 * @description Handles operations for registerDoctor. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.registerDoctor = async (req, res, next) => {
    try {
        const { name, email, password, specialty, licenseNumber, department, consultationFee } = req.body;

        if (!name || !email || !password || !specialty || !licenseNumber) {
            return res.status(400).json({ success: false, message: 'Name, email, password, specialty, and licenseNumber are required' , error: 'Name, email, password, specialty, and licenseNumber are required'  });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' , error: 'Please provide a valid email address'  });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' , error: 'Password must be at least 6 characters long'  });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email already exists' , error: 'User with this email already exists'  });
        }

        const licenseExists = await Doctor.findOne({ licenseNumber });
        if (licenseExists) {
            return res.status(400).json({ success: false, message: 'Doctor with this license number already exists' , error: 'Doctor with this license number already exists'  });
        }

        // Generate Curve25519 (X25519) Key Pair for envelope encryption
        const keyPair = nacl.box.keyPair();
        const publicKey = util.encodeBase64(keyPair.publicKey);
        const privateKey = util.encodeBase64(keyPair.secretKey);

        const user = await User.create({
            name,
            email,
            password,
            role: 'doctor',
            specialty,
            publicKey,
        });

        // The pre-check above (licenseExists) closes the common case, but a genuine race between two concurrent
        // registrations for the same licenseNumber — or any other Doctor-creation failure — can still fail here
        // AFTER the User already exists. Without a rollback, that leaves a role:'doctor' User with no Doctor
        // profile behind. Mirrors the same rollback already used by adminController.createUser for this exact
        // User-then-profile sequence.
        let doctor;
        try {
            doctor = await Doctor.create({
                user: user._id,
                specialty,
                licenseNumber,
                department: department || 'General Medicine',
                consultationFee: consultationFee || 0,
            });
        } catch (doctorError) {
            await User.findByIdAndDelete(user._id);
            const message = doctorError && doctorError.code === 11000
                ? 'Doctor with this license number already exists'
                : 'Failed to create doctor profile';
            return res.status(400).json({ success: false, message, error: message });
        }

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Doctor registered successfully',

            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    specialty: user.specialty,
                    publicKey: user.publicKey,
                },

                doctor,
                token,
                privateKey
            }
        });
    } catch (error) {
        console.error('Error in registerDoctor:', error);
        next(error);
    }
};

/**
 * loginDoctor
 * @description Handles operations for loginDoctor. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.loginDoctor = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' , error: 'Email and password are required'  });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' , error: 'Invalid email or password'  });
        }

        if (user.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Access denied. Account is not a doctor.' , error: 'Access denied. Account is not a doctor.'  });
        }

        // Credentials are already verified above. Login RESOLVES the existing Doctor profile; it never provisions one (no
        // placeholder specialty / fabricated license). A doctor account whose profile was never provisioned is refused with a
        // controlled 403 and NO token — profiles come only from the explicit paths (admin user creation, doctor registration).
        const doctor = await Doctor.findOne({ user: user._id });
        if (!doctor) {
            return res.status(403).json({ success: false, message: 'Doctor profile not provisioned for this account. Contact an administrator.', error: 'DOCTOR_PROFILE_REQUIRED' });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Doctor login successful',

            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    specialty: user.specialty,
                    publicKey: user.publicKey,
                },

                doctor,
                token
            }
        });
    } catch (error) {
        console.error('Error in loginDoctor:', error);
        next(error);
    }
};

/**
 * getDoctorPatients
 * @description Handles operations for getDoctorPatients. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getDoctorPatients = async (req, res, next) => {
    try {
        const userDoctor = await User.findById(req.user._id).populate('assignedPatients', 'name email role publicKey').lean();
        const doctorProfile = await Doctor.findOne({ user: req.user._id }).populate({
            path: 'assignedPatients',
            populate: { path: 'user', select: 'name email role publicKey' }
        }).lean();

        const legacyPatients = userDoctor?.assignedPatients || [];
        const doctorPatients = doctorProfile?.assignedPatients || [];

        const patientMap = new Map();

        for (const user of legacyPatients) {
            if (user) {
                patientMap.set(user._id.toString(), {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    publicKey: user.publicKey,
                });
            }
        }

        for (const pat of doctorPatients) {
            if (pat && pat.user) {
                patientMap.set(pat.user._id.toString(), {
                    _id: pat.user._id,
                    name: pat.user.name,
                    email: pat.user.email,
                    role: pat.user.role,
                    publicKey: pat.user.publicKey,
                    dateOfBirth: pat.dateOfBirth,
                    gender: pat.gender,
                    bloodGroup: pat.bloodGroup,
                    allergies: pat.allergies,
                });
            }
        }

        const normalizedPatients = Array.from(patientMap.values());

        res.status(200).json({ success: true, message: 'Operation successful', data: normalizedPatients });
    } catch (error) {
        console.error('Error in getDoctorPatients:', error);
        next(error);
    }
};

const { hasActiveConsent } = require('../../../middlewares/consentMiddleware');

/**
 * getPatientEMR
 * @description Handles operations for getPatientEMR. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPatientEMR = async (req, res, next) => {
    try {
        const { patientId } = req.params;

        // Verify active consent before opening patient EMR. The response bundles four kinds of data, so each section requires a
        // consent whose SCOPE permits that resource (the patient profile is part of the medical record); the request is refused only
        // when NO section is permitted. A doctor with a single-resource consent receives only that section.
        const canSee = {};
        for (const sc of ['medical_records', 'prescriptions', 'lab_reports', 'certificates']) {
            canSee[sc] = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user, requiredScope: sc });
        }
        if (!Object.values(canSee).some(Boolean)) {
            return res.status(403).json({ success: false, message: 'Access Denied: Active patient consent is required for doctor access.' , error: 'Access Denied: Active patient consent is required for doctor access.'  });
        }

        const patientUser = await User.findById(patientId).select('-password');
        let patientProfile = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] })
            .populate('user', 'name email role publicKey');

        if (!patientProfile && patientUser) {
            patientProfile = { user: patientUser };
        }

        const pId = patientProfile?._id || patientId;
        const uId = patientUser?._id || patientId;

        const medicalRecords = !canSee.medical_records ? [] : await MedicalRecord.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ visitDate: -1 });

        const prescriptions = !canSee.prescriptions ? [] : await Prescription.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const labReports = !canSee.lab_reports ? [] : await LabReport.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const certificates = !canSee.certificates ? [] : await Certificate.find({
            patient: { $in: [pId, uId] }
        }).select('-encryptedCredential').sort({ createdAt: -1 });

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            patient: canSee.medical_records ? patientProfile : null,
            patientUser: canSee.medical_records ? patientUser : null,
            medicalRecords,
            prescriptions,
            labReports,
            certificates,
        } });
    } catch (error) {
        console.error('Error in getPatientEMR:', error);
        next(error);
    }
};

/**
 * isValidIdInput
 * @description True only for a 24-hex ObjectId string or an ObjectId instance. Rejects objects/arrays/numbers/empty
 * values (e.g. a body `patientId` of `{ "$ne": null }`), so callers answer 400 instead of a cast error surfacing as a 500
 * or an operator object widening the Patient lookup.
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
 * profile is NOT given one — Patient profiles come only from the deliberate provisioning paths). Returns null when the
 * input is not a valid id or no matching Patient exists — callers answer 400 (invalid, via isValidIdInput) / 404 (null).
 * The result is not an authorization decision. Same contract as the resolver in the EMR/lab/prescription controllers.
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
 * refBelongsToPatient
 * @description True when a stored patient reference (a MedicalRecord's `patient`) is this patient: their Patient._id, or — for
 * legacy records — their User._id. Read-only. Same relationship the dedicated prescription controller uses.
 * @param {*} storedRef - the reference stored on the record
 * @param {*} patientId - the resolved Patient._id
 * @returns {Promise<boolean>}
 */
const refBelongsToPatient = async (storedRef, patientId) => {
    if (!storedRef || !patientId) return false;
    if (String(storedRef) === String(patientId)) return true;
    const p = await Patient.findById(patientId).select('user').lean();
    return !!(p && p.user && String(storedRef) === String(p.user));
};

/**
 * updatePatientDiagnosis
 * @description Handles operations for updatePatientDiagnosis. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updatePatientDiagnosis = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'Not authorized, user not found', error: 'Not authorized, user not found' });
        }
        const { patientId } = req.params;
        const { chiefComplaint, diagnosis, treatmentPlan, vitals } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ success: false, message: 'Diagnosis field is required' , error: 'Diagnosis field is required'  });
        }

        // The recording doctor is the caller's EXISTING Doctor profile; it is never auto-created (no placeholder specialty /
        // fabricated license). A caller without one is refused up front with a controlled 403 and nothing is written.
        const doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to record a diagnosis.', error: 'DOCTOR_PROFILE_REQUIRED' });
        }

        // Role policy (same as uploadPrescription / addClinicalNotes / the dedicated controllers): only a doctor or an administrator.
        // The route already limits this endpoint to doctors; this keeps a direct handler call to the same policy.
        if (!(req.user.role === 'doctor' || req.user.role === 'admin' || req.user.role === 'hospital_admin')) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to record a diagnosis.', error: 'Access Denied: Role not authorized to record a diagnosis.' });
        }

        // The patient is the EXISTING Patient profile; it is never auto-created from the supplied id. An invalid id is a 400 and a
        // missing profile a controlled 404 — in both cases nothing is created or written and no later step runs.
        if (!isValidIdInput(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        const resolvedPatientId = await resolvePatientId(patientId);
        if (!resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }

        // AUTHORIZATION against the RESOLVED Patient, decided ONLY by the project's single consent authority (hasActiveConsent) and
        // applied to EVERY caller that reaches this point (it used to run only when req.user.role === 'doctor'): an ACTIVE, UNEXPIRED
        // Consent granted to this authenticated caller; administrators keep their existing access. An assignment, authorship of an
        // earlier record, a name or any request-body identity/reference field NEVER grants access. This endpoint accepts no record
        // id: it always creates a NEW diagnosis record for the resolved patient, so there is no existing record whose ownership
        // could be claimed. It is decided BEFORE the record write, the hash anchoring and the audit row.
        if (!(await hasActiveConsent({ patientInput: resolvedPatientId, requestingUser: req.user, requiredScope: 'medical_records' }))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to modify patient diagnosis.', error: 'Access Denied: Not authorized to modify patient diagnosis.' });
        }

        // 1. Convert record to canonical JSON. NOT `JSON.stringify(recordData, Object.keys(recordData).sort())`: that
        // array-form replacer is applied at EVERY nesting level, so nested `vitals` sub-fields (bloodPressure, heartRate,
        // temperature, ...) — none of which are themselves in the top-level key list — were silently serialized as `{}`,
        // regardless of what was actually stored. `canonicalize()` recursively sorts keys at every level instead, so the
        // hash represents the complete record, matching the technique already fixed for this same reason in
        // emrRecordController.js::canonicalizeEMRData.
        const recordData = {
            patient: resolvedPatientId.toString(),
            doctor: doctorDoc._id.toString(),
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date().toISOString(),
        };
        const recordJSON = canonicalize(recordData);

        // 2. Generate SHA256 hash
        const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');

        // 3. Store record in MongoDB
        const medicalRecord = await MedicalRecord.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date(),
            dataHash,
            recordHash: dataHash,
        });

        // 4. Anchor the hash on-chain using the SAME commit-reveal flow already established and working in
        // emrRecordController.js::createEMR — the live EMR blockchain ABI has no `storeEMRRecord` method (that call always
        // threw here, silently, and the handler still reported success). Blockchain failure does not roll back the
        // MongoDB write, matching createEMR's own existing policy that anchoring is non-fatal to the record operation —
        // but unlike createEMR's response, this handler never claims anchoring occurred when it did not.
        let transactionHash = null;
        let blockchainAnchored = false;
        try {
            const { ethers } = require('ethers');

            const nonceBuffer = crypto.randomBytes(32);
            const nonce = '0x' + nonceBuffer.toString('hex');
            const innerHash = ethers.solidityPackedKeccak256(['string'], [dataHash]);

            let signerAddress = '0x0000000000000000000000000000000000000000';
            if (blockchainContract.runner && typeof blockchainContract.runner.getAddress === 'function') {
                signerAddress = await blockchainContract.runner.getAddress();
            } else if (blockchainContract.signer && typeof blockchainContract.signer.getAddress === 'function') {
                signerAddress = await blockchainContract.signer.getAddress();
            }

            const commitment = ethers.solidityPackedKeccak256(
                ['bytes32', 'bytes32', 'address'],
                [innerHash, nonce, signerAddress]
            );

            const currentNonce = await blockchainContract.runner.getNonce('latest');
            const commitTx = await blockchainContract.commitHash(commitment, { nonce: currentNonce });
            await commitTx.wait();

            const revealTx = await blockchainContract.revealHash(
                resolvedPatientId.toString(),
                'MedicalRecord',
                dataHash,
                '',
                nonce,
                { nonce: currentNonce + 1 }
            );
            await revealTx.wait();

            transactionHash = revealTx.hash;
            blockchainAnchored = true;

            medicalRecord.transactionHash = transactionHash;
            medicalRecord.blockchainHash = transactionHash;
            await medicalRecord.save();
        } catch (contractError) {
            console.error('Blockchain commit/reveal failed for updatePatientDiagnosis:', contractError.message);
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'update_diagnosis', patientId, recordId: medicalRecord._id, dataHash, transactionHash, blockchainAnchored }
        });

        // 5. Report the REAL anchoring outcome — never claim success the chain call didn't achieve.
        res.status(200).json({
            success: true,
            message: blockchainAnchored
                ? 'Diagnosis updated and anchored to blockchain successfully'
                : 'Diagnosis updated successfully; blockchain anchoring failed and was NOT recorded',

            data: {
                dataHash,
                transactionHash,
                blockchainAnchored,
                medicalRecord
            }
        });
    } catch (error) {
        console.error('Error in updatePatientDiagnosis:', error);
        next(error);
    }
};

/**
 * addClinicalNotes
 * @description Handles operations for addClinicalNotes. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.addClinicalNotes = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'Not authorized, user not found', error: 'Not authorized, user not found' });
        }
        const { patientId } = req.params;
        const { clinicalNotes, recordId } = req.body;

        if (!clinicalNotes) {
            return res.status(400).json({ success: false, message: 'Clinical notes content is required' , error: 'Clinical notes content is required'  });
        }

        // The authenticated caller's EXISTING Doctor profile (server-derived from the session; never auto-created, never taken
        // from the request). A caller without one is refused with a controlled 403 and nothing is written.
        const doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to add clinical notes.', error: 'DOCTOR_PROFILE_REQUIRED' });
        }

        // Role policy (same as uploadPrescription / the dedicated controllers): only a doctor or an administrator. A caller of
        // any other role no longer skips authorization when the handler is reached directly.
        if (!(req.user.role === 'doctor' || req.user.role === 'admin' || req.user.role === 'hospital_admin')) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to add clinical notes.', error: 'Access Denied: Role not authorized to add clinical notes.' });
        }

        // The patient is the EXISTING Patient profile; it is never auto-created from the supplied id (invalid id -> 400, missing
        // profile -> controlled 404, nothing created or written).
        if (!isValidIdInput(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        const resolvedPatientId = await resolvePatientId(patientId);
        if (!resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }

        // AUTHORIZATION against the RESOLVED Patient, decided ONLY by the project's single consent authority (hasActiveConsent):
        // an ACTIVE, UNEXPIRED Consent granted to this authenticated caller; administrators keep their existing access. Being the
        // record's original author (record.doctor), an assignment, a name or any request-body identity field NEVER grants access.
        // Decided BEFORE the record is looked up (no record/patient linkage is revealed to an unconsented caller) and before any write.
        if (!(await hasActiveConsent({ patientInput: resolvedPatientId, requestingUser: req.user, requiredScope: 'medical_records' }))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to add clinical notes.', error: 'Access Denied: Not authorized to add clinical notes.' });
        }

        // A supplied record is loaded from the database and must belong to THIS resolved patient; a patient id inside the request
        // never decides ownership.
        let record;
        if (recordId) {
            if (!isValidIdInput(recordId)) {
                return res.status(400).json({ success: false, message: 'Invalid record identifier', error: 'Invalid record identifier' });
            }
            record = await MedicalRecord.findById(recordId);
            if (record && !(await refBelongsToPatient(record.patient, resolvedPatientId))) {
                return res.status(403).json({ success: false, message: 'Access Denied: Record does not belong to specified patient.', error: 'Access Denied: Record does not belong to specified patient.' });
            }
        }

        if (!record) {
            // Creating a NEW note record: recorded under the caller's authenticated Doctor profile (resolved above).
            record = await MedicalRecord.create({
                patient: resolvedPatientId,
                doctor: doctorDoc._id,
                chiefComplaint: 'Clinical Note Entry',
                diagnosis: 'Clinical Consultation',
                clinicalNotes,
                visitDate: new Date(),
            });
        } else {
            record.clinicalNotes = record.clinicalNotes
                ? `${record.clinicalNotes}\n\n[${new Date().toISOString()}] ${clinicalNotes}`
                : clinicalNotes;
            await record.save();
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'add_clinical_notes', patientId, recordId: record._id }
        });

        res.status(200).json({
            success: true,
            message: 'Clinical notes added successfully',

            data: {
                record
            }
        });
    } catch (error) {
        console.error('Error in addClinicalNotes:', error);
        next(error);
    }
};

/**
 * uploadPrescription
 * @description Handles operations for uploadPrescription. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.uploadPrescription = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'Not authorized, user not found', error: 'Not authorized, user not found' });
        }
        const { patientId, medications, instructions, medicalRecordId } = req.body;

        if (!patientId || !medications || !Array.isArray(medications) || medications.length === 0) {
            return res.status(400).json({ success: false, message: 'patientId and medications array are required' , error: 'patientId and medications array are required'  });
        }

        // The prescribing doctor is the caller's EXISTING Doctor profile; it is never auto-created (no placeholder specialty /
        // fabricated license). A caller without one is refused up front with a controlled 403 and nothing is written.
        const doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to upload a prescription.', error: 'DOCTOR_PROFILE_REQUIRED' });
        }

        // Role policy (same as the dedicated prescription controller): only a doctor or an administrator may create a
        // prescription. The route already limits this endpoint to doctors; this keeps a direct handler call to the same policy.
        if (!(req.user.role === 'doctor' || req.user.role === 'admin' || req.user.role === 'hospital_admin')) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to create prescriptions.', error: 'Access Denied: Role not authorized to create prescriptions.' });
        }

        // The patient is the EXISTING Patient profile; it is never auto-created from the supplied id (invalid id -> 400, missing
        // profile -> controlled 404, nothing created or written).
        if (!isValidIdInput(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        const resolvedPatientId = await resolvePatientId(patientId);
        if (!resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }

        // AUTHORIZATION against the RESOLVED Patient, decided by the project's single consent authority (hasActiveConsent): an
        // ACTIVE, UNEXPIRED Consent granted to this authenticated caller (by User id or Doctor profile id); administrators keep
        // their existing access. Assignments, record authorship, names and request-body identity fields never grant access.
        // Decided BEFORE anything is looked up further or written.
        if (!(await hasActiveConsent({ patientInput: resolvedPatientId, requestingUser: req.user, requiredScope: 'prescriptions' }))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to create prescriptions.', error: 'Access Denied: Patient active consent is required to create prescriptions.' });
        }

        // The optional linked medical record must exist AND belong to THIS resolved patient. The record is loaded from the
        // database; a patient id inside the request never decides ownership.
        let linkedRecordId;
        if (medicalRecordId !== undefined && medicalRecordId !== null && medicalRecordId !== '') {
            if (!isValidIdInput(medicalRecordId)) {
                return res.status(400).json({ success: false, message: 'Invalid medical record identifier', error: 'Invalid medical record identifier' });
            }
            const linkedRecord = await MedicalRecord.findById(medicalRecordId).select('patient').lean();
            if (!linkedRecord) {
                return res.status(404).json({ success: false, message: 'EMR not found', error: 'EMR not found' });
            }
            if (!(await refBelongsToPatient(linkedRecord.patient, resolvedPatientId))) {
                return res.status(403).json({ success: false, message: 'Access Denied: The EMR does not belong to this patient.', error: 'Access Denied: The EMR does not belong to this patient.' });
            }
            linkedRecordId = linkedRecord._id;
        }

        // Generate digital signature hash
        const signaturePayload = `${resolvedPatientId}|${doctorDoc._id}|${JSON.stringify(medications)}|${Date.now()}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        const prescription = await Prescription.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            medicalRecord: linkedRecordId,
            medications,
            instructions,
            digitalSignatureHash,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'upload_prescription', prescriptionId: prescription._id, patientId: resolvedPatientId }
        });

        res.status(201).json({
            success: true,
            message: 'Prescription uploaded and digitally signed successfully',

            data: {
                prescription,
                digitalSignatureHash
            }
        });
    } catch (error) {
        console.error('Error in uploadPrescription:', error);
        next(error);
    }
};

/**
 * getDoctorProfile
 * @description Retrieves the profile for the currently authenticated doctor.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 */
exports.getDoctorProfile = async (req, res, next) => {
    try {
        const user = req.user;
        
        // Find corresponding Doctor profile
        const doctor = await Doctor.findOne({ user: user._id }).lean();
        
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
        }

        res.status(200).json({
            success: true,
            doctor: {
                id: doctor._id,
                name: user.name,
                email: user.email,
                contactNumber: user.contactNumber || 'Not provided',
                specialty: doctor.specialty || 'Not provided',
                licenseNumber: doctor.licenseNumber || 'Not provided',
                department: doctor.department || 'Not provided',
                consultationFee: doctor.consultationFee !== undefined ? doctor.consultationFee : 0
            }
        });
    } catch (error) {
        console.error('Error in getDoctorProfile:', error);
        next(error);
    }
};

// ────────────────────────────────────────────────────────────────────────────
// AVAILABILITY MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * getMyAvailability
 * GET /api/doctor/me/availability
 * Returns the authenticated doctor's availability schedule.
 * @access doctor only
 */
exports.getMyAvailability = async (req, res, next) => {
    try {
        const doctor = await Doctor.findOne({ user: req.user._id })
            .select('availability appointmentDuration')
            .lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
        }
        res.status(200).json({
            success: true,
            data: {
                availability: doctor.availability || null,
                appointmentDuration: doctor.appointmentDuration ?? 30,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * updateMyAvailability
 * PUT /api/doctor/me/availability
 * Updates the authenticated doctor's availability schedule.
 * @access doctor only
 */
exports.updateMyAvailability = async (req, res, next) => {
    try {
        const { availability, appointmentDuration } = req.body;

        // Validate appointmentDuration
        if (appointmentDuration !== undefined) {
            const dur = Number(appointmentDuration);
            if (!Number.isFinite(dur) || !Number.isInteger(dur) || dur < 5 || dur > 480) {
                return res.status(400).json({
                    success: false,
                    message: 'appointmentDuration must be an integer between 5 and 480 minutes.',
                });
            }
        }

        // Validate each day
        if (availability) {
            for (const day of DAYS) {
                const d = availability[day];
                if (!d) continue;
                if (d.enabled) {
                    if (!d.startTime || !TIME_RE.test(d.startTime)) {
                        return res.status(400).json({
                            success: false,
                            message: `${day}: startTime must be in HH:MM 24-hour format (e.g. "09:00").`,
                        });
                    }
                    if (!d.endTime || !TIME_RE.test(d.endTime)) {
                        return res.status(400).json({
                            success: false,
                            message: `${day}: endTime must be in HH:MM 24-hour format (e.g. "17:00").`,
                        });
                    }
                    const [sh, sm] = d.startTime.split(':').map(Number);
                    const [eh, em] = d.endTime.split(':').map(Number);
                    if (sh * 60 + sm >= eh * 60 + em) {
                        return res.status(400).json({
                            success: false,
                            message: `${day}: endTime must be after startTime.`,
                        });
                    }
                }
            }
        }

        const update = {};
        if (availability !== undefined) update.availability = availability;
        if (appointmentDuration !== undefined) update.appointmentDuration = Number(appointmentDuration);

        const doctor = await Doctor.findOneAndUpdate(
            { user: req.user._id },
            { $set: update },
            { new: true, runValidators: true }
        ).select('availability appointmentDuration');

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Availability updated successfully.',
            data: {
                availability: doctor.availability,
                appointmentDuration: doctor.appointmentDuration,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * getAvailableSlots
 * GET /api/doctor/:doctorId/slots?date=YYYY-MM-DD
 * Returns available (not yet booked) appointment slots for a doctor on a given date.
 * @access any authenticated user
 */
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        // ── Input validation ──────────────────────────────────────────────
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'date query parameter is required in YYYY-MM-DD format.',
            });
        }
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            return res.status(400).json({ success: false, message: 'Invalid doctorId.' });
        }

        // ── Load doctor availability ──────────────────────────────────────
        const doctor = await Doctor.findById(doctorId)
            .select('availability appointmentDuration')
            .lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        const avail = doctor.availability;
        const anyDayEnabled = avail && DAYS.some(d => avail[d] && avail[d].enabled);
        if (!avail || !anyDayEnabled) {
            return res.status(200).json({
                success: true,
                date,
                configured: false,
                slots: [],
                message: 'Doctor availability is not configured.',
            });
        }

        // ── Determine day of week ─────────────────────────────────────────
        // Interpret date as local calendar date by splitting YYYY-MM-DD
        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const [yStr, mStr, dStr] = date.split('-');
        const reqYear = parseInt(yStr, 10);
        const reqMonth = parseInt(mStr, 10) - 1;
        const reqDate = parseInt(dStr, 10);
        
        // Create date object strictly in local timezone using Date components
        const dateObj = new Date(reqYear, reqMonth, reqDate);
        const dayName = DAY_NAMES[dateObj.getDay()];
        const dayConfig = avail[dayName];

        if (!dayConfig || !dayConfig.enabled) {
            return res.status(200).json({
                success: true,
                date,
                configured: true,
                slots: [],
                message: `Doctor is not available on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.`,
            });
        }

        // ── Generate all slots for the day ───────────────────────────────
        const [startH, startM] = dayConfig.startTime.split(':').map(Number);
        const [endH,   endM]   = dayConfig.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes   = endH   * 60 + endM;
        const duration = doctor.appointmentDuration || 30;

        const allSlots = [];
        for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            const period = h < 12 ? 'AM' : 'PM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            const label = `${String(displayH).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`;
            allSlots.push({ label, minutes: m });
        }

        // ── Find already-booked slots ─────────────────────────────────────
        // Strictly define start and end of the requested local day
        const dayStart = new Date(reqYear, reqMonth, reqDate, 0, 0, 0, 0);
        const dayEnd   = new Date(reqYear, reqMonth, reqDate, 23, 59, 59, 999);

        const booked = await Appointment.find({
            doctor: doctorId,
            appointmentDate: { $gte: dayStart, $lte: dayEnd },
            status: { $in: ['scheduled', 'completed'] },
        }).select('timeSlot').lean();

        const bookedSet = new Set(booked.map(a => a.timeSlot));

        // ── Filter: remove booked + past slots (for today) ────────────────
        const now = new Date();
        const isToday = dateObj.toDateString() === now.toDateString();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const availableSlots = allSlots
            .filter(s => !bookedSet.has(s.label))
            .filter(s => !isToday || s.minutes > nowMinutes)
            .map(s => s.label);

        res.status(200).json({
            success: true,
            date,
            configured: true,
            slots: availableSlots,
        });
    } catch (err) {
        next(err);
    }
};
