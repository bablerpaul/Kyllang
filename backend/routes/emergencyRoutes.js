// KYLLANG_V4: Emergency routes for Mass Casualty Incident management
const express = require('express');
const router = express.Router();
const mciController = require('../emergency/mci-controller');
const { protect, admin } = require('../middlewares/authMiddleware');

router.get('/status', mciController.getMCIStatus);
router.post('/activate', protect, admin, mciController.activateMCI);
router.post('/deactivate', protect, admin, mciController.deactivateMCI);

module.exports = router;
