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
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('doctor'));

router.get('/patients', getPatients);
router.get('/patients/:patientId/documents', getPatientDocuments);
router.get('/documents/:docId', getDocument);
router.post('/documents/:docId/request', requestDocumentAccess);
router.post('/certificates', issueCertificate);
router.get('/certificate-requests', getCertificateRequests);
router.post('/certificate-requests/:id/approve', approveCertificateRequest);

module.exports = router;
