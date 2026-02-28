const express = require('express');
const router = express.Router();
const {
    getDocuments,
    approveDoctorAccess,
    requestCertificate,
    getAssignedDoctors,
    getCertificates
} = require('../controllers/patientController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('general_user'));

router.get('/documents', getDocuments);
router.get('/doctors', getAssignedDoctors);
router.get('/certificates', getCertificates);
router.post('/documents/:docId/approve', approveDoctorAccess);
router.post('/certificates/request', requestCertificate);

module.exports = router;
