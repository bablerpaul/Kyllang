const express = require('express');
const { getAppointments, createAppointment, updateAppointmentStatus } = require('./appointmentController');
const { protect } = require('../../../middlewares/authMiddleware'); // Verify path to authMiddleware

const router = express.Router();

router.route('/')
    .get(protect, getAppointments)
    .post(protect, createAppointment);

router.route('/:id/status')
    .put(protect, updateAppointmentStatus);

module.exports = router;
