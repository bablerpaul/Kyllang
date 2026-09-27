const express = require('express');
const router = express.Router();
const {
    getAnalytics,
    getAuditLogs,
    getAllUsers,
    createUser,
    deleteUser,
    assignDoctor,
    uploadDocument,
    anchorLogs,
    getMonitoringDashboard,
    getAllCertificates
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
router.delete('/users/:id', deleteUser);
router.post('/assign', assignDoctor);
router.post('/documents', uploadDocument);
router.post('/anchor-logs', anchorLogs);
router.get('/dashboard', getMonitoringDashboard);
router.get('/certificates', getAllCertificates);

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', getNotifications);
router.patch('/notifications/read-all', markAllRead);
router.patch('/notifications/:id', markRead);

module.exports = router;
