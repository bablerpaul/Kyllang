const express = require('express');
const router = express.Router();
const { cacheRoute } = require('../src/middlewares/cacheMiddleware');
const {
    getDocuments,
    approveDoctorAccess,
    requestCertificate,
    getAssignedDoctors,
    getCertificates
} = require('../controllers/patientController');
const {
    registerPatient,
    loginPatient,
    getPatientProfile,
    updatePatientProfile,
    getPatientMedicalHistory
} = require('../src/modules/patients/patientController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const { registerLimiter, loginLimiter } = require('../middlewares/rateLimiter');
const { patientRegisterRules } = require('../validators/authValidator');
const { validate } = require('../middlewares/validatorMiddleware');

// Public Patient Routes
router.post('/register', registerLimiter, patientRegisterRules(), validate, registerPatient);
router.post('/login', loginLimiter, loginPatient);

// Protected Patient Routes
router.use(protect);
router.use(authorize('general_user'));

// Get Patient Profile (Cached for 1 hour)
router.get('/profile', cacheRoute('patient_profile', 3600), getPatientProfile);
router.put('/profile', updatePatientProfile);
router.get('/history', getPatientMedicalHistory);

// Legacy/Existing Patient Endpoints (Preserved 100%)
router.get('/documents', getDocuments);
router.get('/doctors', getAssignedDoctors);
router.get('/certificates', getCertificates);
router.post('/documents/:docId/approve', approveDoctorAccess);
router.post('/certificates/request', requestCertificate);

module.exports = router;
