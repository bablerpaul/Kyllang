const express = require('express');
const router = express.Router();
const { cacheRoute } = require('../src/middlewares/cacheMiddleware');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const tempUploadsDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempUploadsDir),
    filename: (req, file, cb) => cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
});

const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
});
const {
    getPatients,
    getPatientDocuments,
    requestDocumentAccess,
    issueCertificate,
    getDocument,
    getCertificateRequests,
    approveCertificateRequest
} = require('../controllers/doctorController');
const {
    registerDoctor,
    loginDoctor,
    getDoctorPatients,
    getPatientEMR,
    updatePatientDiagnosis,
    addClinicalNotes,
    uploadPrescription
} = require('../src/modules/doctors/doctorController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { registerLimiter, loginLimiter, uploadLimiter } = require('../middlewares/rateLimiter');
const { doctorRegisterRules } = require('../validators/authValidator');
const { emrDiagnosisRules, emrNotesRules } = require('../validators/emrValidator');
const { certificateIssueRules } = require('../validators/certificateValidator');
const { validate } = require('../middlewares/validatorMiddleware');

// Public Doctor Routes
router.post('/register', registerLimiter, doctorRegisterRules(), validate, registerDoctor);
router.post('/login', loginLimiter, loginDoctor);

// Protected Doctor Routes
router.use(protect);
router.use(authorize('doctor'));

// EMR Patient & Clinical Operations
router.get('/patients', cacheRoute('doctor_profile', 3600), getDoctorPatients);
router.get('/patient/:patientId/emr', getPatientEMR);
router.put('/patient/:patientId/diagnosis', emrDiagnosisRules(), validate, updatePatientDiagnosis);
router.post('/patient/:patientId/notes', emrNotesRules(), validate, addClinicalNotes);
router.post('/prescriptions', uploadPrescription);

// Legacy/Existing Doctor Endpoints (Preserved 100%)
router.get('/patients/:patientId/documents', getPatientDocuments);
router.get('/documents/:docId', getDocument);
router.post('/documents/:docId/request', requestDocumentAccess);
router.post('/certificates', uploadLimiter, upload.single('file'), certificateIssueRules(), validate, issueCertificate);
router.get('/certificate-requests', getCertificateRequests);
router.post('/certificate-requests/:id/approve', approveCertificateRequest);

module.exports = router;
