const express = require('express');
const router = express.Router();
const {
    getAnalytics,
    getAuditLogs,
    getAllUsers,
    createUser,
    assignDoctor,
    uploadDocument,
    anchorLogs,
    getMonitoringDashboard
} = require('../controllers/adminController');

const {
    getNotifications,
    markRead,
    markAllRead
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('hospital_admin'));

router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.post('/assign', assignDoctor);
router.post('/documents', uploadDocument);
router.post('/anchor-logs', anchorLogs);
router.get('/dashboard', getMonitoringDashboard);

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', getNotifications);
router.patch('/notifications/read-all', markAllRead);
router.patch('/notifications/:id', markRead);

module.exports = router;
