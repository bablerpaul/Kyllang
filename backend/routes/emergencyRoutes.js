// KYLLANG_V4: Emergency routes for Mass Casualty Incident management
const express = require('express');
const router = express.Router();
const mciController = require('../emergency/mci-controller');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { breakGlassLimiter } = require('../middlewares/rateLimiter');

router.get('/status', mciController.getMCIStatus);
router.post('/activate', protect, authorize('hospital_admin', 'admin'), mciController.activateMCI);
router.post('/deactivate', protect, authorize('hospital_admin', 'admin'), mciController.deactivateMCI);
router.post('/break-glass', protect, authorize('doctor', 'hospital_admin', 'admin'), breakGlassLimiter, mciController.breakGlass);

module.exports = router;
