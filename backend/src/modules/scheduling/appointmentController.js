const { Appointment } = require('../../models');

// @desc    Get all appointments for the logged-in user (patient or doctor)
// @route   GET /api/appointments
// @access  Private
const getAppointments = async (req, res, next) => {
    try {
        const query = req.user.role === 'Doctor' 
            ? { doctorId: req.user.id } 
            : { patientId: req.user.id };
            
        const appointments = await Appointment.find(query)
            .populate('patientId', 'name email')
            .populate('doctorId', 'name email specialization')
            .sort({ startTime: 1 });

        res.status(200).json({ success: true, count: appointments.length, data: appointments });
    } catch (err) {
        next(err);
    }
};

// @desc    Create a new appointment
// @route   POST /api/appointments
// @access  Private
const createAppointment = async (req, res, next) => {
    try {
        const { doctorId, startTime, endTime, notes } = req.body;
        
        // Ensure patient is booking for themselves
        const patientId = req.user.id;
        
        const appointment = await Appointment.create({
            patientId,
            doctorId,
            startTime,
            endTime,
            notes
        });

        res.status(201).json({ success: true, data: appointment });
    } catch (err) {
        next(err);
    }
};

// @desc    Update appointment status
// @route   PUT /api/appointments/:id/status
// @access  Private (Doctor or Patient)
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        let appointment = await Appointment.findById(req.params.id);
        
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }
        
        // Authorization check (IDOR prevention)
        if (appointment.patientId.toString() !== req.user.id && appointment.doctorId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this appointment' });
        }

        appointment.status = status;
        await appointment.save();
        
        res.status(200).json({ success: true, data: appointment });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAppointments,
    createAppointment,
    updateAppointmentStatus
};
