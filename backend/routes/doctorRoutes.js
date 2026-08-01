const express = require('express');
const router = express.Router();
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

// Public Doctor Routes
router.post('/register', registerDoctor);
router.post('/login', loginDoctor);

// Protected Doctor Routes
router.use(protect);
router.use(authorize('doctor'));

// EMR Patient & Clinical Operations
router.get('/patients', getDoctorPatients);
router.get('/patient/:patientId/emr', getPatientEMR);
router.put('/patient/:patientId/diagnosis', updatePatientDiagnosis);
router.post('/patient/:patientId/notes', addClinicalNotes);
router.post('/prescriptions', uploadPrescription);

// Legacy/Existing Doctor Endpoints (Preserved 100%)
router.get('/patients/:patientId/documents', getPatientDocuments);
router.get('/documents/:docId', getDocument);
router.post('/documents/:docId/request', requestDocumentAccess);
router.post('/certificates', issueCertificate);
router.get('/certificate-requests', getCertificateRequests);
router.post('/certificate-requests/:id/approve', approveCertificateRequest);

module.exports = router;
