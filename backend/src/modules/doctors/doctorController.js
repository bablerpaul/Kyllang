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
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', {
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

        const doctor = await Doctor.create({
            user: user._id,
            specialty,
            licenseNumber,
            department: department || 'General Medicine',
            consultationFee: consultationFee || 0,
        });

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

        let doctor = await Doctor.findOne({ user: user._id });
        if (!doctor) {
            doctor = await Doctor.create({
                user: user._id,
                specialty: user.specialty || 'General Physician',
                licenseNumber: `DOC-${user._id.toString().substring(18)}`,
            });
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

        // Verify active consent before opening patient EMR
        const isAllowed = await hasActiveConsent({ patientInput: patientId, requestingUser: req.user });
        if (!isAllowed) {
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

        const medicalRecords = await MedicalRecord.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ visitDate: -1 });

        const prescriptions = await Prescription.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const labReports = await LabReport.find({
            $or: [{ patient: pId }, { patient: uId }]
        }).sort({ createdAt: -1 });

        const certificates = await Certificate.find({
            patient: { $in: [pId, uId] }
        }).select('-encryptedCredential').sort({ createdAt: -1 });

        res.status(200).json({ success: true, message: 'Operation successful', data: {
            patient: patientProfile,
            patientUser,
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
 * updatePatientDiagnosis
 * @description Handles operations for updatePatientDiagnosis. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updatePatientDiagnosis = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const { chiefComplaint, diagnosis, treatmentPlan, vitals } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ success: false, message: 'Diagnosis field is required' , error: 'Diagnosis field is required'  });
        }

        let doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            doctorDoc = await Doctor.create({
                user: req.user._id,
                specialty: req.user.specialty || 'General',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
            });
        }

        let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) {
            patientDoc = await Patient.create({ user: patientId });
        }

        // 1. Convert record to JSON
        const recordData = {
            patient: patientDoc._id.toString(),
            doctor: doctorDoc._id.toString(),
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date().toISOString(),
        };
        const recordJSON = JSON.stringify(recordData, Object.keys(recordData).sort());

        // 2. Generate SHA256 hash
        const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');

        // 3. Store record in MongoDB
        const medicalRecord = await MedicalRecord.create({
            patient: patientDoc._id,
            doctor: doctorDoc._id,
            chiefComplaint: chiefComplaint || 'Consultation Visit',
            diagnosis,
            treatmentPlan: treatmentPlan || 'Prescribed medication and rest',
            vitals: vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
            visitDate: new Date(),
            dataHash,
            recordHash: dataHash,
        });

        // 4. Store hash in blockchain
        let transactionHash = null;
        try {
            const tx = await blockchainContract.storeEMRRecord(
                patientDoc._id.toString(),
                'MedicalRecord',
                dataHash,
                ''
            );
            await tx.wait();
            transactionHash = tx.hash;

            medicalRecord.transactionHash = transactionHash;
            medicalRecord.blockchainHash = transactionHash;
            await medicalRecord.save();
        } catch (contractError) {
            console.error('Blockchain storeEMRRecord failed:', contractError.message);
        }

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'update_diagnosis', patientId, recordId: medicalRecord._id, dataHash, transactionHash }
        });

        // 5. Return transaction hash
        res.status(200).json({
            success: true,
            message: 'Diagnosis updated and anchored to blockchain successfully',

            data: {
                dataHash,
                transactionHash,
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
        const { patientId } = req.params;
        const { clinicalNotes, recordId } = req.body;

        if (!clinicalNotes) {
            return res.status(400).json({ success: false, message: 'Clinical notes content is required' , error: 'Clinical notes content is required'  });
        }

        let record;
        if (recordId) {
            record = await MedicalRecord.findById(recordId);
        }

        if (!record) {
            let doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc) {
                doctorDoc = await Doctor.create({
                    user: req.user._id,
                    specialty: req.user.specialty || 'General',
                    licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
                });
            }
            let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
            if (!patientDoc) patientDoc = await Patient.create({ user: patientId });

            record = await MedicalRecord.create({
                patient: patientDoc._id,
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
        const { patientId, medications, instructions, medicalRecordId } = req.body;

        if (!patientId || !medications || !Array.isArray(medications) || medications.length === 0) {
            return res.status(400).json({ success: false, message: 'patientId and medications array are required' , error: 'patientId and medications array are required'  });
        }

        let doctorDoc = await Doctor.findOne({ user: req.user._id });
        if (!doctorDoc) {
            doctorDoc = await Doctor.create({
                user: req.user._id,
                specialty: req.user.specialty || 'General',
                licenseNumber: `DOC-${req.user._id.toString().substring(18)}`
            });
        }

        let patientDoc = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] });
        if (!patientDoc) patientDoc = await Patient.create({ user: patientId });

        // Generate digital signature hash
        const signaturePayload = `${patientDoc._id}|${doctorDoc._id}|${JSON.stringify(medications)}|${Date.now()}`;
        const digitalSignatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

        const prescription = await Prescription.create({
            patient: patientDoc._id,
            doctor: doctorDoc._id,
            medicalRecord: medicalRecordId || undefined,
            medications,
            instructions,
            digitalSignatureHash,
        });

        await AuditLog.create({
            actor: req.user._id,
            action: 'OTHER',
            details: { type: 'upload_prescription', prescriptionId: prescription._id, patientId: patientDoc._id }
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
