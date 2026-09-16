const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
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
 * resolvePatientId
 * @description Handles operations for resolvePatientId. Explains parameters, return values and usage.
 * @param {*} idInput - idInput parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const resolvePatientId = async (idInput) => {
    let patient = await Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!patient) {
        const userExists = await User.findById(idInput);
        if (userExists) {
            patient = await Patient.create({ user: idInput });
        }
    }
    return patient ? patient._id : idInput;
};

/**
 * resolveDoctorId
 * @description Handles operations for resolveDoctorId. Explains parameters, return values and usage.
 * @param {*} idInput - idInput parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const resolveDoctorId = async (idInput) => {
    let doctor = await Doctor.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!doctor) {
        doctor = await Doctor.create({
            user: idInput,
            specialty: 'General Medicine',
            licenseNumber: `DOC-${idInput.toString().substring(18)}`,
        });
    }
    return doctor ? doctor._id : idInput;
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
        const { appointmentId, patientId, patient, diagnosis, symptoms, vitalSigns, vitals, allergies, medications, clinicalNotes, chiefComplaint, treatmentPlan, visitDate, attachments } = req.body;

        const targetPatientInput = patientId || patient;
        if (!targetPatientInput || !diagnosis) {
            return res.status(400).json({ success: false, message: 'Patient reference and diagnosis are required' , error: 'Patient reference and diagnosis are required'  });
        }

        const resolvedPatientId = await resolvePatientId(targetPatientInput);
        const resolvedDoctorId = await resolveDoctorId(req.user._id);

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

        // 4. Store hash in blockchain via Commit-Reveal
        let transactionHash = null;
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
            details: { patientId: resolvedPatientId, diagnosis }
        });

        res.status(201).json({
            success: true,
            message: 'EMR record created and anchored to blockchain successfully',

            data: {
                dataHash,
                transactionHash,
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

        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (req.query.patientId) {
            const pId = await resolvePatientId(req.query.patientId);
            filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
        }

        const emrs = await MedicalRecord.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } })
            .sort({ visitDate: -1 });

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

const { hasActiveConsent } = require('../../../middlewares/consentMiddleware');

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
        const pId = await resolvePatientId(patientId);

        // Verify patient-controlled consent before returning medical data
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view medical records.' , error: 'Access Denied: Patient active consent is required to view medical records.'  });
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
        const isAllowed = await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user });
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

        // Apply Authorization: Admins can verify all, Doctors must be the attending doctor, Patients must be the record owner.
        if (req.user.role === 'general_user') {
            const isAllowed = await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user });
            if (!isAllowed) {
                return res.status(403).json({ success: false, message: 'Access Denied: Patient active consent is required to view this medical record.' });
            }
        } else if (req.user.role === 'doctor') {
            const doc = await Doctor.findOne({ user: req.user._id });
            if (!doc || doc._id.toString() !== emr.doctor.toString()) {
                // Alternatively, doctors with explicit consent might be able to view it.
                const isAllowed = await hasActiveConsent({ patientInput: emr.patient, requestingUser: req.user });
                if (!isAllowed && doc._id.toString() !== emr.doctor.toString()) {
                    return res.status(403).json({ success: false, message: 'Access Denied: Not authorized to verify this EMR' });
                }
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
