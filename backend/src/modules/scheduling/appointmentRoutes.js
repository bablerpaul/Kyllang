const express = require('express');
const { getAppointments, createAppointment, updateAppointmentStatus, rescheduleAppointment, getAvailableGlobalSlots } = require('./appointmentController');
// Path resolves to: backend/middlewares/authMiddleware.js (verified correct)
const { protect, authorize } = require('../../../middlewares/authMiddleware');

const router = express.Router();

router.get('/available-slots', protect, authorize('general_user'), getAvailableGlobalSlots);

router.route('/')
    .get(protect, getAppointments)
    .post(protect, authorize('general_user', 'hospital_admin'), createAppointment);

router.route('/:id/status')
    .put(protect, updateAppointmentStatus);

// Reschedule a cancelled appointment (doctor only — backend enforces ownership)
router.route('/:id/reschedule')
    .put(protect, authorize('doctor'), rescheduleAppointment);

module.exports = router;
