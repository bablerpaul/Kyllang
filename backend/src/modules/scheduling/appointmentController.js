const { Appointment } = require('../../models');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const mongoose = require('mongoose');

/**
 * Helper to safely parse YYYY-MM-DD into a local Date object without UTC-shifting
 */
const parseLocalDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return null;
    }
    const [yStr, mStr, dStr] = dateString.split('-');
    const reqYear  = parseInt(yStr, 10);
    const reqMonth = parseInt(mStr, 10) - 1;
    const reqDay   = parseInt(dStr, 10);
    const date = new Date(reqYear, reqMonth, reqDay);
    if (isNaN(date.getTime())) return null;
    return date;
};

// @desc    Get all appointments for the logged-in user (patient or doctor)
// @route   GET /api/appointments
// @access  Private
const getAppointments = async (req, res, next) => {
    try {
        let filter = {};
        const role = req.user.role;
        const { patientId } = req.query;

        if (role === 'doctor') {
            // Appointment.doctor refs Doctor._id — must look up the Doctor profile first
            const doctorDoc = await Doctor.findOne({ user: req.user._id }).select('_id');
            if (!doctorDoc) {
                return res.status(404).json({ success: false, message: 'Doctor profile not found for this account.' });
            }
            filter = { doctor: doctorDoc._id };
            
            if (patientId) {
                const p = await Patient.findOne({ $or: [{ _id: patientId }, { user: patientId }] }).select('_id');
                if (p) filter.patient = p._id;
                else filter.patient = patientId;
            }
        } else if (role === 'general_user') {
            // Appointment.patient refs Patient._id — must look up the Patient profile first
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
            .sort({ appointmentDate: 1 });

        res.status(200).json({ success: true, count: appointments.length, data: appointments });
    } catch (err) {
        next(err);
    }
};

// @desc    Get globally available slots across all doctors
// @route   GET /api/appointments/available-slots
// @access  Private
const getAvailableGlobalSlots = async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, message: 'date query parameter is required in YYYY-MM-DD format.' });
        }

        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const [yStr, mStr, dStr] = date.split('-');
        const reqYear = parseInt(yStr, 10);
        const reqMonth = parseInt(mStr, 10) - 1;
        const reqDate = parseInt(dStr, 10);
        const dateObj = new Date(reqYear, reqMonth, reqDate);
        const dayName = DAY_NAMES[dateObj.getDay()];

        const doctors = await Doctor.find().select('_id availability appointmentDuration').lean();

        const allSlotsSet = new Set();
        const docSlotMap = new Map(); // doctorId -> set of slot labels

        const now = new Date();
        const isToday = dateObj.toDateString() === now.toDateString();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const doc of doctors) {
            const avail = doc.availability;
            const dayConfig = avail && avail[dayName];
            if (!dayConfig || !dayConfig.enabled) continue;

            const [startH, startM] = dayConfig.startTime.split(':').map(Number);
            const [endH,   endM]   = dayConfig.endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes   = endH   * 60 + endM;
            const duration = doc.appointmentDuration || 30;

            const docSlots = new Set();
            for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
                const h = Math.floor(m / 60);
                const min = m % 60;
                const period = h < 12 ? 'AM' : 'PM';
                const displayH = h % 12 === 0 ? 12 : h % 12;
                const label = `${String(displayH).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`;
                
                if (!isToday || m > nowMinutes) {
                    docSlots.add(label);
                    allSlotsSet.add(label);
                }
            }
            docSlotMap.set(doc._id.toString(), docSlots);
        }

        const dayStart = new Date(reqYear, reqMonth, reqDate, 0, 0, 0, 0);
        const dayEnd   = new Date(reqYear, reqMonth, reqDate, 23, 59, 59, 999);

        const booked = await Appointment.find({
            appointmentDate: { $gte: dayStart, $lte: dayEnd },
            status: { $in: ['scheduled', 'completed'] },
        }).select('doctor timeSlot').lean();

        for (const b of booked) {
            const dSlots = docSlotMap.get(b.doctor.toString());
            if (dSlots) {
                dSlots.delete(b.timeSlot);
            }
        }

        const finalAvailableSlots = new Set();
        for (const [docId, slots] of docSlotMap.entries()) {
            for (const s of slots) {
                finalAvailableSlots.add(s);
            }
        }

        const parseTime = (label) => {
            const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
            if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
            return h * 60 + m;
        };

        const sortedSlots = Array.from(finalAvailableSlots).sort((a, b) => parseTime(a) - parseTime(b));

        res.status(200).json({
            success: true,
            date,
            slots: sortedSlots
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Create a new appointment
// @route   POST /api/appointments
// @access  Private (general_user, hospital_admin only)
const createAppointment = async (req, res, next) => {
    try {
        const { doctorId, patientId, appointmentDate, timeSlot, reason, clinicalNotes } = req.body;

        if (req.user.role === 'doctor') {
            return res.status(403).json({ success: false, message: 'Doctors cannot create patient appointments.' });
        }

        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate is required.' });
        }
        const apptDate = parseLocalDate(appointmentDate);
        if (!apptDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate must be a valid date in YYYY-MM-DD format.' });
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (apptDate < todayStart) {
            return res.status(400).json({ success: false, message: 'appointmentDate cannot be in the past.' });
        }
        if (!timeSlot || !timeSlot.toString().trim()) {
            return res.status(400).json({ success: false, message: 'timeSlot is required.' });
        }
        if (!reason || !reason.toString().trim()) {
            return res.status(400).json({ success: false, message: 'reason is required.' });
        }

        // ── Resolve Patient ────────────────────────────────────────────────
        let resolvedPatientId;
        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (!patientDoc) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient profile not found for this account. Please contact the administrator.',
                });
            }
            resolvedPatientId = patientDoc._id;
        } else if (req.user.role === 'hospital_admin') {
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
            const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = DAY_NAMES[apptDate.getDay()];

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
                const dayConfig = avail && avail[dayName];
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

            const dayStart = new Date(apptDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(apptDate);
            dayEnd.setHours(23, 59, 59, 999);

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

        // ── Validate Doctor ────────────────────────────────────────────────
        const doctorDoc = await Doctor.findById(finalDoctorId);
        if (!doctorDoc) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        // ── Double-booking check ───────────────────────────────────────────
        const existing = await Appointment.findOne({
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            status: { $in: ['scheduled', 'completed'] },
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor. Please choose a different time.',
            });
        }

        // ── Create ─────────────────────────────────────────────────────────
        const appointment = await Appointment.create({
            patient: resolvedPatientId,
            doctor: doctorDoc._id,
            appointmentDate: apptDate,
            timeSlot: timeSlot.trim(),
            reason: reason.trim(),
            clinicalNotes: clinicalNotes || undefined,
        });

        res.status(201).json({ success: true, data: appointment });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked for the selected doctor.',
            });
        }
        next(err);
    }
};

// @desc    Update appointment status
// @route   PUT /api/appointments/:id/status
// @access  Private (Doctor or Patient — only their own appointment)
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        // ── Validate incoming status ───────────────────────────────────────
        const VALID_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}.`,
            });
        }

        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found.' });
        }

        // ── Authorization: resolve Patient/Doctor and compare to appointment ──
        let isOwner = false;

        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id }).select('_id');
            if (patientDoc && appointment.patient.toString() === patientDoc._id.toString()) {
                isOwner = true;
            }
        } else if (req.user.role === 'doctor') {
            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (doctorDoc && appointment.doctor.toString() === doctorDoc._id.toString()) {
                isOwner = true;
            }
        } else if (req.user.role === 'hospital_admin') {
            // Admins can update any appointment status
            isOwner = true;
        }

        if (!isOwner) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this appointment.' });
        }

        // ── Appointment confirmation rules ──────────────────────────────────
        if (status === 'confirmed') {
            if (req.user.role !== 'doctor') {
                return res.status(403).json({ success: false, message: 'Only a doctor can confirm an appointment.' });
            }
            if (appointment.status !== 'scheduled') {
                return res.status(400).json({ success: false, message: 'Only scheduled appointments can be confirmed.' });
            }

            const doctorDoc = await Doctor.findOne({ user: req.user._id });
            if (!doctorDoc || appointment.doctor.toString() !== doctorDoc._id.toString()) {
                return res.status(403).json({ success: false, message: 'Cannot confirm an appointment assigned to another doctor.' });
            }

            // Perform automatic patient-doctor assignment upon confirmation
            // This is done sequentially. The project doesn't currently use Mongoose transactions (startSession).
            const doctorUser = await User.findById(req.user._id);
            const doctorProfile = doctorDoc;
            const patientProfile = await Patient.findById(appointment.patient);

            if (!patientProfile) {
                return res.status(404).json({ success: false, message: 'Patient profile not found.' });
            }

            if (doctorUser && !doctorUser.assignedPatients.includes(patientProfile.user)) {
                doctorUser.assignedPatients.push(patientProfile.user);
                await doctorUser.save();
            }
            if (doctorProfile && !doctorProfile.assignedPatients.includes(patientProfile._id)) {
                doctorProfile.assignedPatients.push(patientProfile._id);
                await doctorProfile.save();
            }
            
            const patUser = await User.findById(patientProfile.user);
            if (patUser && !patUser.assignedDoctors.includes(doctorProfile._id)) {
                patUser.assignedDoctors.push(doctorProfile._id);
                await patUser.save();
            }
            if (!patientProfile.assignedDoctors.includes(doctorProfile._id)) {
                patientProfile.assignedDoctors.push(doctorProfile._id);
                await patientProfile.save();
            }
        }

        appointment.status = status;
        await appointment.save();

        res.status(200).json({ success: true, data: appointment });
    } catch (err) {
        next(err);
    }
};

// @desc    Reschedule a cancelled appointment to a new date/time
// @route   PUT /api/appointments/:id/reschedule
// @access  Private (Doctor only — must own the appointment)
const rescheduleAppointment = async (req, res, next) => {
    try {
        const { appointmentDate, timeSlot } = req.body;

        // ── Only doctors can reschedule ────────────────────────────────────
        if (req.user.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Only doctors can reschedule appointments.' });
        }

        // ── Input validation ───────────────────────────────────────────────
        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate is required.' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
            return res.status(400).json({ success: false, message: 'appointmentDate must be in YYYY-MM-DD format.' });
        }
        if (!timeSlot || !timeSlot.toString().trim()) {
            return res.status(400).json({ success: false, message: 'timeSlot is required.' });
        }

        // ── Parse date using local calendar (avoid UTC-shift bug) ──────────
        const newDate = parseLocalDate(appointmentDate);

        if (!newDate) {
            return res.status(400).json({ success: false, message: 'appointmentDate must be a valid date in YYYY-MM-DD format.' });
        }

        // Must be today or in the future (compare at day-start)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (newDate < todayStart) {
            return res.status(400).json({ success: false, message: 'New appointment date cannot be in the past.' });
        }

        // ── Load appointment ───────────────────────────────────────────────
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found.' });
        }

        // ── Verify doctor owns appointment ─────────────────────────────────
        const doctorDoc = await Doctor.findOne({ user: req.user._id }).select('_id availability appointmentDuration');
        if (!doctorDoc || appointment.doctor.toString() !== doctorDoc._id.toString()) {
            // Use 403 regardless of whether the profile is missing or mismatched,
            // so callers cannot infer appointment existence from the response code.
            return res.status(403).json({ success: false, message: 'Not authorized to reschedule this appointment.' });
        }

        // ── Only cancelled appointments can be rescheduled ─────────────────
        if (appointment.status !== 'cancelled') {
            return res.status(400).json({
                success: false,
                message: `Only cancelled appointments can be rescheduled. Current status: ${appointment.status}.`,
            });
        }

        // ── Validate doctor is available on the chosen day ─────────────────
        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName   = DAY_NAMES[newDate.getDay()];
        const avail     = doctorDoc.availability;
        const dayConfig = avail && avail[dayName];

        if (!dayConfig || !dayConfig.enabled) {
            return res.status(400).json({
                success: false,
                message: `Doctor is not available on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.`,
            });
        }

        // ── Validate timeSlot is within the doctor's configured hours ──────
        const [startH, startM] = dayConfig.startTime.split(':').map(Number);
        const [endH,   endM]   = dayConfig.endTime.split(':').map(Number);
        const startMinutes     = startH * 60 + startM;
        const endMinutes       = endH   * 60 + endM;
        const duration         = doctorDoc.appointmentDuration || 30;

        // Parse the requested timeSlot label (e.g. "09:30 AM") into minutes
        const slotMatch = timeSlot.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!slotMatch) {
            return res.status(400).json({ success: false, message: 'timeSlot format is invalid. Expected HH:MM AM/PM.' });
        }
        let slotHour = parseInt(slotMatch[1], 10);
        const slotMin  = parseInt(slotMatch[2], 10);
        const period   = slotMatch[3].toUpperCase();
        if (period === 'PM' && slotHour !== 12) slotHour += 12;
        if (period === 'AM' && slotHour === 12) slotHour  = 0;
        const slotMinutes = slotHour * 60 + slotMin;

        const validSlot = slotMinutes >= startMinutes && slotMinutes + duration <= endMinutes;
        if (!validSlot) {
            return res.status(400).json({
                success: false,
                message: 'The selected time slot is outside the doctor\'s configured availability hours.',
            });
        }

        // ── If rescheduling to today, slot must be in the future ───────────
        const now = new Date();
        const isToday = newDate.toDateString() === now.toDateString();
        if (isToday && slotMinutes <= now.getHours() * 60 + now.getMinutes()) {
            return res.status(400).json({ success: false, message: 'The selected time slot has already passed today.' });
        }

        // ── Double-booking check ───────────────────────────────────────────
        const conflict = await Appointment.findOne({
            _id:             { $ne: appointment._id },   // exclude self
            doctor:          doctorDoc._id,
            appointmentDate: newDate,
            timeSlot:        timeSlot.trim(),
            status:          { $in: ['scheduled', 'completed'] },
        });
        if (conflict) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked. Please choose a different date or time.',
            });
        }

        // ── Preserve original scheduling info for audit ────────────────────
        appointment.rescheduledFrom = {
            appointmentDate: appointment.appointmentDate,
            timeSlot:        appointment.timeSlot,
        };
        appointment.rescheduledAt = new Date();

        // ── Apply reschedule ───────────────────────────────────────────────
        appointment.appointmentDate = newDate;
        appointment.timeSlot        = timeSlot.trim();
        appointment.status          = 'scheduled';

        await appointment.save();

        // Re-populate for consistent response shape
        await appointment.populate([
            { path: 'patient', select: 'dateOfBirth gender bloodGroup', populate: { path: 'user', select: 'name email' } },
            { path: 'doctor',  select: 'specialty licenseNumber department', populate: { path: 'user', select: 'name email' } },
        ]);

        res.status(200).json({ success: true, data: appointment });
    } catch (err) {
        if (err.code === 11000) {
            // Partial unique index conflict (double-booking at DB level)
            return res.status(409).json({ success: false, message: 'This time slot is already booked. Please choose a different date or time.' });
        }
        next(err);
    }
};

module.exports = {
    getAppointments,
    createAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
    getAvailableGlobalSlots,
};
