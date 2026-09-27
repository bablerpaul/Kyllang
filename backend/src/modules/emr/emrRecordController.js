const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');
const blockchainContract = require('../../../blockchain');

/**
 * Helper function to canonicalize EMR data deterministically
 * Addresses Mongoose subdocument `_id` leakage, defaults, and key ordering
 */
const canonicalizeEMRData = (value) => {
    if (value === null || value === undefined) {
        return value;
    }

    // 1. Convert Mongoose Documents to plain logical data
    if (typeof value.toObject === 'function') {
        value = value.toObject({ getters: true, virtuals: false, minimize: false });
    }

    // 2. Dates to exact ISO string
    if (value instanceof Date) {
        return value.toISOString();
    }

    // 3. ObjectIds to strings
    if (value._bsontype === 'ObjectID' || value.constructor.name === 'ObjectId') {
        return value.toString();
    }

    // 4. Arrays: preserve order
    if (Array.isArray(value)) {
        return value.map(item => canonicalizeEMRData(item));
    }

    // 5. Objects: sort keys, strip Mongoose fields
    if (typeof value === 'object') {
        const sortedObj = {};
        Object.keys(value).sort().forEach(key => {
            // Strip Mongoose internal and hash/anchor fields
            if (key === '_id' || key === 'id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
                return;
            }
            if (key === 'blockchainHash' || key === 'transactionHash' || key === 'dataHash' || key === 'recordHash') {
                return;
            }
            
            // Note: Mongoose defaults (like temperature: 98.6) will still appear here
            // if the original create request relied on them. To be strictly compatible with 
            // the historical hashes, we sort object keys.
            sortedObj[key] = canonicalizeEMRData(value[key]);
        });
        return sortedObj;
    }

    return value;
};

/**
 * Helper function to compute canonical SHA-256 hash of an EMR
 */
const computeEMRHash = (emr) => {
    // Normalize vitalSigns to only the 3 canonical fields used at creation time.
    // Mongoose schema defaults (respiratoryRate, oxygenSaturation) must NOT be included
    // because they were not present in the plain object that was hashed during createEMR.
    const rawVitals = emr.vitalSigns || emr.vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 };
    const vitalSigns = {
        bloodPressure: rawVitals.bloodPressure || '120/80',
        heartRate: rawVitals.heartRate !== undefined ? rawVitals.heartRate : 72,
        temperature: rawVitals.temperature !== undefined ? rawVitals.temperature : 98.6,
    };

    const recordData = {
        patient: emr.patient ? (emr.patient._id || emr.patient).toString() : '',
        doctor: emr.doctor ? (emr.doctor._id || emr.doctor).toString() : '',
        diagnosis: emr.diagnosis,
        symptoms: emr.symptoms || [],
        vitalSigns,
        allergies: emr.allergies || [],
        medications: emr.medications || [],
        clinicalNotes: emr.clinicalNotes || '',
        chiefComplaint: emr.chiefComplaint || emr.diagnosis,
        treatmentPlan: emr.treatmentPlan || '',
        visitDate: emr.visitDate ? new Date(emr.visitDate).toISOString() : new Date().toISOString(),
    };
    
    // Canonicalize properly rather than relying on JSON.stringify replacer array
    const canonicalData = canonicalizeEMRData(recordData);
    const recordJSON = JSON.stringify(canonicalData);
    
    return crypto.createHash('sha256').update(recordJSON).digest('hex');
};

/**
 * isValidIdInput
 * @description True only for a 24-hex ObjectId string or an ObjectId instance. Rejects objects/arrays/numbers/empty
 * values (e.g. `?patientId[$ne]=x`), so callers can answer 400 instead of letting a cast error surface as a 500.
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
 * createEMR
 * @description Handles operations for createEMR. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createEMR = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'Not authorized, user not found', error: 'Not authorized, user not found' });
        }
        const { appointmentId, patientId, patient, diagnosis, symptoms, vitalSigns, vitals, allergies, medications, clinicalNotes, chiefComplaint, treatmentPlan, visitDate, attachments } = req.body;

        const targetPatientInput = patientId || patient;
        if (!targetPatientInput || !diagnosis) {
            return res.status(400).json({ success: false, message: 'Patient reference and diagnosis are required' , error: 'Patient reference and diagnosis are required'  });
        }

        if (!isValidIdInput(targetPatientInput)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }
        const resolvedPatientId = await resolvePatientId(targetPatientInput);
        if (!resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }
        // The recording doctor is the authenticated caller's EXISTING Doctor profile. A caller without one (a doctor whose
        // profile was never provisioned, or an administrator) is refused with a controlled 403 — a profile is never
        // auto-created as a side effect of this request.
        const resolvedDoctorId = await resolveDoctorId(req.user._id);
        if (!resolvedDoctorId) {
            return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to create EMR records.', error: 'Access Denied: A Doctor profile is required to create EMR records.' });
        }

        // Role policy (same as the other hardened doctor writes / the dedicated controllers): only a doctor or an administrator.
        // The route already limits this endpoint to doctor / hospital_admin; this keeps a direct handler call to the same policy.
        if (!(req.user.role === 'doctor' || req.user.role === 'admin' || req.user.role === 'hospital_admin')) {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized to create EMR records.', error: 'Access Denied: Role not authorized to create EMR records.' });
        }

        // AUTHORIZATION against the RESOLVED Patient:
        // A doctor is authorized to create an EMR if they are assigned to the patient (via confirmed appointment),
        // OR if they independently satisfy the existing consent model (active Consent record).
        const doctorProfile = await require('../../../models/Doctor').findById(resolvedDoctorId).lean();
        const isAssigned = doctorProfile && doctorProfile.assignedPatients && doctorProfile.assignedPatients.some(id => id.toString() === resolvedPatientId.toString());

        if (!isAssigned && !((await isDoctorAssigned(req.user, resolvedPatientId)) || await hasActiveConsent({ patientInput: resolvedPatientId, requestingUser: req.user, requiredScope: 'medical_records'  }))) {
            return res.status(403).json({ success: false, message: 'Access Denied: You must be assigned to this patient or have active consent to create EMR records.', error: 'Access Denied: You must be assigned to this patient or have active consent to create EMR records.' });
        }

        const vDate = visitDate ? new Date(visitDate) : new Date();

        let appointment = null;
        if (appointmentId) {
            const Appointment = require('../../../models/Appointment');
            appointment = await Appointment.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }
            if (appointment.doctor.toString() !== resolvedDoctorId.toString()) {
                return res.status(403).json({ success: false, message: 'Cannot create EMR for an appointment assigned to another doctor' });
            }
            if (appointment.patient.toString() !== resolvedPatientId.toString()) {
                return res.status(400).json({ success: false, message: 'Appointment patient does not match the provided patient' });
            }
        }

        // 1. Build a plain object to hash (matching fields the DB will store with their defaults)
        const vSigns = vitalSigns || vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 };
        const emrToHash = {
            patient: resolvedPatientId.toString(),
            doctor: resolvedDoctorId.toString(),
            diagnosis,
            symptoms: symptoms || [],
            vitalSigns: vSigns,
            allergies: allergies || [],
            medications: medications || [],
            clinicalNotes: clinicalNotes || '',
            chiefComplaint: chiefComplaint || diagnosis,
            treatmentPlan: treatmentPlan || '',
            visitDate: vDate,
        };

        // 2. Compute SHA-256 hash of the plain object
        const dataHash = computeEMRHash(emrToHash);

        // 3. Create and save Mongoose Document with all fields
        const emr = new MedicalRecord({
            patient: resolvedPatientId,
            doctor: resolvedDoctorId,
            appointment: appointment ? appointment._id : undefined,
            diagnosis,
            symptoms: symptoms || [],
            vitalSigns: vSigns,
            vitals: vitals || vSigns,
            allergies: allergies || [],
            medications: medications || [],
            clinicalNotes: clinicalNotes || '',
            chiefComplaint: chiefComplaint || diagnosis,
            treatmentPlan: treatmentPlan || '',
            visitDate: vDate,
            attachments: attachments || [],
            dataHash,
            recordHash: dataHash,
        });
        await emr.save();

        // 4. Store hash in blockchain via Commit-Reveal. Anchoring is BEST-EFFORT / non-fatal to EMR creation — the
        // MongoDB write above already happened and is never rolled back if this fails (the established, existing
        // policy of this handler; unchanged by this fix). What changed: the response below used to unconditionally
        // claim "anchored to blockchain successfully" even when this whole block threw and transactionHash stayed
        // null. `blockchainAnchored` now tracks the REAL outcome so the response can never make that false claim
        // (same fix already applied to the sibling handler updatePatientDiagnosis in Step 79).
        let transactionHash = null;
        let blockchainAnchored = false;
        try {
            const crypto = require('crypto');
            const { ethers } = require('ethers');

            const firstCid = (attachments && attachments.length > 0 && attachments[0].ipfsCid) ? attachments[0].ipfsCid : '';

            // 4a. Generate cryptographically secure nonce
            const nonceBuffer = crypto.randomBytes(32);
            const nonce = '0x' + nonceBuffer.toString('hex');

            // 4b. Calculate commitment matching Solidity: keccak256(abi.encodePacked(keccak256(abi.encodePacked(dataHash)), nonce, msg.sender))
            const innerHash = ethers.solidityPackedKeccak256(['string'], [dataHash]);

            // Determine backend signer address
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

            // 4c. Commit transaction
            const currentNonce = await blockchainContract.runner.getNonce('latest');
            const commitTx = await blockchainContract.commitHash(commitment, { nonce: currentNonce });
            await commitTx.wait();

            // 4d. Reveal transaction (must use same msg.sender, immediately after commit)
            const revealTx = await blockchainContract.revealHash(
                resolvedPatientId.toString(),
                'MedicalRecord',
                dataHash,
                firstCid,
                nonce,
                { nonce: currentNonce + 1 }
            );
            await revealTx.wait();

            transactionHash = revealTx.hash;
            blockchainAnchored = true;

            emr.transactionHash = transactionHash;
            emr.blockchainHash = transactionHash;
            await emr.save();
        } catch (contractError) {
            console.error('Blockchain contract commit/reveal failed:', contractError.message);
        }

        const populatedEmr = await MedicalRecord.findById(emr._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        // Store Audit Log (User, Action: CREATED, Timestamp, IP Address, Blockchain Transaction, Hash)
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: dataHash,
            blockchainTransaction: transactionHash,
            details: { patientId: resolvedPatientId, diagnosis, blockchainAnchored }
        });

        // The EMR record itself was created either way (blockchain anchoring is non-fatal, per the existing policy
        // above) — but the message and blockchainAnchored flag must never claim anchoring succeeded when it did not.
        res.status(201).json({
            success: true,
            message: blockchainAnchored
                ? 'EMR record created and anchored to blockchain successfully'
                : 'EMR record created successfully, but blockchain anchoring failed',

            data: {
                dataHash,
                transactionHash,
                blockchainAnchored,
                emr: populatedEmr
            }
        });
    } catch (error) {
        console.error('Error in createEMR:', error);
        next(error);
    }
};

/**
 * getAllEMRs
 * @description Handles operations for getAllEMRs. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllEMRs = async (req, res, next) => {
    try {
        let filter = {};

        if (req.user.role === 'general_user' || req.user.role === 'patient') {
            const patientDoc = await Patient.findOne({ $or: [{ _id: req.user._id }, { user: req.user._id }] });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (req.user.role === 'admin' || req.user.role === 'hospital_admin') {
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
        } else if (req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            const docId = doctorDoc ? doctorDoc._id : null;
            
            if (req.query.patientId) {
                if (!isValidIdInput(req.query.patientId)) {
                    return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
                }
                const isAllowed = (await isDoctorAssigned(req.user, req.query.patientId)) || await hasActiveConsent({ patientInput: req.query.patientId, requestingUser: req.user, requiredScope: 'medical_records'  });
                if (!isAllowed) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view medical records.' });
                }
                const pId = await resolvePatientId(req.query.patientId);
                if (!pId) {
                    return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
                }
                filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
            } else {
                // Consent is the ONLY source of a doctor's access to patients' records. An assignment
                // (doctor.assignedPatients / Patient.assignedDoctors) is NOT consent, so it is never consulted here.
                const Consent = require('../../../models/Consent');
                const now = new Date();
                // Every condition is a separate $and clause (two "$or" keys in ONE object literal would overwrite each other),
                // and only defined ids are used: the consent must be granted to THIS doctor, active, and unexpired.
                const granteeConditions = [{ grantedTo: req.user._id }];
                if (docId) granteeConditions.push({ grantedToDoctor: docId });
                const activeConsents = await Consent.find({
                    $and: [
                        { grantedToRole: 'doctor' },
                        consentScopeFilter('medical_records'),
                        { status: 'active' },
                        { $or: granteeConditions },
                        { $or: [
                            { expiresAt: { $gt: now } },
                            { expiresAt: null },
                            { expiresAt: { $exists: false } }
                        ] }
                    ]
                });

                let allowedPatientIds = [...new Set(activeConsents.map(c => (c.patient ? c.patient.toString() : '')).filter(Boolean))];
                
                if (doctorDoc && doctorDoc.assignedPatients) {
                    doctorDoc.assignedPatients.forEach(pid => {
                        if (pid) allowedPatientIds.push(pid.toString());
                    });
                    allowedPatientIds = [...new Set(allowedPatientIds)];
                }
                
                if (allowedPatientIds.length === 0) {
                    // Store Audit Log for VIEWED action (empty)
                    await logAudit({ req, action: 'VIEWED', resource: 'MedicalRecord', details: { type: 'get_all_emrs', count: 0 } });
                    return res.status(200).json({ success: true, message: 'Operation successful', data: [] });
                }
                filter = { patient: { $in: allowedPatientIds } };
            }
        } else {
            return res.status(403).json({ success: false, message: 'Access Denied: Role not authorized for EMR listing.' });
        }

        const found = await MedicalRecord.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 });

        // Defense in depth: whatever the list query returned, a doctor only receives records for which the SAME
        // per-record consent rule used by the other EMR endpoints (hasActiveConsent) currently allows access.
        let emrs = found;
        if (req.user.role === 'doctor') {
            const verdicts = new Map();
            emrs = [];
            for (const emr of found) {
                const pid = emr.patient && emr.patient._id ? String(emr.patient._id) : null;
                if (!pid) continue; // a record with no resolvable patient is never shown to a doctor
                if (!verdicts.has(pid)) verdicts.set(pid, (await isDoctorAssigned(req.user, pid)) || await hasActiveConsent({ patientInput: pid, requestingUser: req.user, requiredScope: 'medical_records'  }));
                if (verdicts.get(pid)) emrs.push(emr);
            }
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            details: { type: 'get_all_emrs', count: emrs.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: emrs });
    } catch (error) {
        console.error('Error in getAllEMRs:', error);
        next(error);
    }
};

const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');

async function isDoctorAssigned(reqUser, patientId) {
    if (reqUser.role !== 'doctor') return false;
    const Doctor = require('../../../models/Doctor');
    const doctorProfile = await Doctor.findOne({ user: reqUser._id }).lean();
    const pidString = (patientId && patientId._id) ? patientId._id.toString() : (patientId ? patientId.toString() : '');
    return doctorProfile && doctorProfile.assignedPatients && doctorProfile.assignedPatients.some(id => id && id.toString() === pidString);
}


/**
 * getPatientEMRs
 * @description Handles operations for getPatientEMRs. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getPatientEMRs = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        if (!isValidIdInput(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier', error: 'Invalid patient identifier' });
        }

        // A caller acting AS A DOCTOR must have an EXISTING Doctor profile — the same policy enforced by createEMR (this
        // file) and by getMedicalRecord / updateMedicalRecord (emrController.js, Steps 70-71). A Consent's `grantedTo`
        // matches the caller's User id alone and does not itself prove a Doctor profile exists: a patient can grant
        // consent to any User account with role 'doctor' that is in their assignedPatients list (see
        // resolveAssignedDoctor / adminController.assignDoctor), neither of which requires a Doctor profile to exist. A
        // profile is never auto-created here either. hospital_admin's existing broad access (via hasActiveConsent's own
        // admin bypass) is unchanged. Reuses the SAME read-only resolver createEMR already uses in this file.
        if (req.user && req.user.role === 'doctor') {
            const resolvedDoctorId = await resolveDoctorId(req.user._id);
            if (!resolvedDoctorId) {
                return res.status(403).json({ success: false, message: 'Access Denied: A Doctor profile is required to view medical records.', error: 'DOCTOR_PROFILE_REQUIRED' });
            }
        }

        // Verify patient-controlled consent before returning medical data (authorization comes BEFORE any lookup,
        // so an unauthorized caller cannot tell whether a patient exists)
        const isAllowed = (await isDoctorAssigned(req.user, patientId)) || await hasActiveConsent({ patientInput: patientId, requestingUser: req.user, requiredScope: 'medical_records'  });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view medical records.' , error: 'Access Denied: Patient active consent is required to view medical records.'  });
        }

        const pId = await resolvePatientId(patientId);
        if (!pId) {
            return res.status(404).json({ success: false, message: 'Patient not found', error: 'Patient not found' });
        }

        const emrs = await MedicalRecord.find({
            $or: [{ patient: pId }, { patient: patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            resourceId: patientId,
            details: { type: 'get_patient_emrs', count: emrs.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: emrs });
    } catch (error) {
        console.error('Error in getPatientEMRs:', error);
        next(error);
    }
};

/**
 * getEMRById
 * @description Handles operations for getEMRById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getEMRById = async (req, res, next) => {
    try {
        console.log("===> HITTING getEMRById", req.originalUrl, req.params);
        const emr = await MedicalRecord.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        if (!emr) {
            return res.status(404).json({ success: false, message: 'EMR record not found' , error: 'EMR record not found'  });
        }

        // Verify patient-controlled consent before returning medical record
        const isAllowed = (await isDoctorAssigned(req.user, emr.patient)) || await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user, requiredScope: 'medical_records'  });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this medical record.' , error: 'Access Denied: Patient active consent is required to view this medical record.'  });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: emr.dataHash,
            blockchainTransaction: emr.transactionHash,
            details: { diagnosis: emr.diagnosis }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: emr });
    } catch (error) {
        console.error('Error in getEMRById:', error);
        next(error);
    }
};

/**
 * updateEMR
 * @description Handles operations for updateEMR. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updateEMR = async (req, res, next) => {
    try {
        const { diagnosis, symptoms, vitalSigns, vitals, allergies, medications, clinicalNotes, chiefComplaint, treatmentPlan, visitDate, attachments } = req.body;

        let emr = await MedicalRecord.findById(req.params.id);
        if (!emr) {
            return res.status(404).json({ success: false, message: 'EMR record not found' , error: 'EMR record not found'  });
        }

        // A doctor needs an active, unexpired Consent from the patient. Authorship of the record (or an
        // assignment) is NOT consent, so there is no original-doctor bypass.
        if (req.user.role === 'doctor') {
            const isAllowed = (await isDoctorAssigned(req.user, emr.patient)) || await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user, requiredScope: 'medical_records'  });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to modify this EMR' });
            }
        }

        if (diagnosis !== undefined) emr.diagnosis = diagnosis;
        if (symptoms !== undefined) emr.symptoms = symptoms;
        if (vitalSigns !== undefined || vitals !== undefined) {
            const mergedVitals = { ...emr.vitalSigns, ...emr.vitals, ...vitals, ...vitalSigns };
            emr.vitalSigns = mergedVitals;
            emr.vitals = mergedVitals;
        }
        if (allergies !== undefined) emr.allergies = allergies;
        if (medications !== undefined) emr.medications = medications;
        if (clinicalNotes !== undefined) emr.clinicalNotes = clinicalNotes;
        if (chiefComplaint !== undefined) emr.chiefComplaint = chiefComplaint;
        if (treatmentPlan !== undefined) emr.treatmentPlan = treatmentPlan;
        if (visitDate !== undefined) emr.visitDate = visitDate;
        if (attachments !== undefined) emr.attachments = attachments;

        // Recompute hash if needed
        const dataHash = computeEMRHash(emr);

        emr.dataHash = dataHash;
        emr.recordHash = dataHash;
        await emr.save();

        const updatedEmr = await MedicalRecord.findById(emr._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'MedicalRecord',
            resourceId: emr._id,
            hash: emr.dataHash,
            blockchainTransaction: emr.transactionHash,
            details: { type: 'update_emr' }
        });

        res.status(200).json({
            success: true,
            message: 'EMR record updated successfully',

            data: {
                emr: updatedEmr
            }
        });
    } catch (error) {
        console.error('Error in updateEMR:', error);
        next(error);
    }
};

/**
 * deleteEMR
 * @description Handles operations for deleteEMR. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deleteEMR = async (req, res, next) => {
    try {
        const emr = await MedicalRecord.findById(req.params.id);
        if (!emr) {
            return res.status(404).json({ success: false, message: 'EMR record not found' , error: 'EMR record not found'  });
        }

        // A doctor needs an active, unexpired Consent from the patient. Authorship of the record (or an
        // assignment) is NOT consent, so there is no original-doctor bypass.
        if (req.user.role === 'doctor') {
            const isAllowed = (await isDoctorAssigned(req.user, emr.patient)) || await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user, requiredScope: 'medical_records'  });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to delete this EMR' });
            }
        }

        const dataHash = emr.dataHash;
        const transactionHash = emr.transactionHash;

        await MedicalRecord.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'MedicalRecord',
            resourceId: req.params.id,
            hash: dataHash,
            blockchainTransaction: transactionHash,
            details: { type: 'delete_emr' }
        });

        res.status(200).json({
            success: true,
            message: 'EMR record deleted successfully',
            data: {}
        });
    } catch (error) {
        console.error('Error in deleteEMR:', error);
        next(error);
    }
};

/**
 * verifyEMR
 * @description Verifies the integrity of an EMR (database vs blockchain).
 */
exports.verifyEMR = async (req, res, next) => {
    try {
        const emr = await MedicalRecord.findById(req.params.id);
        if (!emr) {
            return res.status(404).json({ success: false, message: 'EMR record not found' });
        }

        // Apply Authorization: Admins can verify all, Patients must be the record owner, Doctors need an active,
        // unexpired Consent from the patient (authorship of the record is NOT consent).
        if (req.user.role === 'general_user') {
            const isAllowed = (await isDoctorAssigned(req.user, emr.patient)) || await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user, requiredScope: 'medical_records'  });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this medical record.' });
            }
        } else if (req.user.role === 'doctor') {
            const isAllowed = (await isDoctorAssigned(req.user, emr.patient)) || await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user, requiredScope: 'medical_records'  });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to verify this EMR' });
            }
        }

        const storedHash = emr.dataHash;
        const emrObj = emr.toObject ? emr.toObject() : emr;
        const recalculatedHash = computeEMRHash(emrObj);

        const databaseIntegrity = (storedHash === recalculatedHash);
        const hasBlockchainAnchor = !!(emr.transactionHash || emr.blockchainHash);

        let blockchainExists = false;

        // Only query the blockchain if database integrity holds and an anchor exists
        if (databaseIntegrity && hasBlockchainAnchor) {
            try {
                // Read from blockchain mapping using stored dataHash
                // Note: The smart contract uses dataHash as the lookup key. 
                // It does not retrieve a stored hash for comparison, it merely confirms existence.
                const result = await blockchainContract.verifyRecordHash(storedHash);
                blockchainExists = result[0];
            } catch (error) {
                console.error('Blockchain verification read error:', error);
            }
        }

        let finalStatus = '';
        if (!databaseIntegrity) {
            finalStatus = 'INTEGRITY MISMATCH';
        } else if (!hasBlockchainAnchor) {
            finalStatus = 'NOT BLOCKCHAIN VERIFIED';
        } else if (blockchainExists) {
            finalStatus = 'VERIFIED';
        } else {
            finalStatus = 'BLOCKCHAIN RECORD NOT FOUND';
        }

        return res.status(200).json({
            verified: finalStatus === 'VERIFIED',
            databaseIntegrity,
            blockchainExists,
            recordId: emr._id,
            storedHash,
            recalculatedHash,
            transactionHash: emr.transactionHash || emr.blockchainHash,
            message: finalStatus
        });
    } catch (error) {
        console.error('Error in verifyEMR:', error);
        next(error);
    }
};
