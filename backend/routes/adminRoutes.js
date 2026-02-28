const express = require('express');
const router = express.Router();
const {
    getAnalytics,
    getAllUsers,
    createUser,
    assignDoctor,
    uploadDocument,
    anchorLogs,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('hospital_admin'));

router.get('/analytics', getAnalytics);
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.post('/assign', assignDoctor);
router.post('/documents', uploadDocument);
router.post('/anchor-logs', anchorLogs);

module.exports = router;
