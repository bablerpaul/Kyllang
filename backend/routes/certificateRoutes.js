const express = require('express');
const router = express.Router();
const {
    createCertificate,
    getMyCertificates,
    verifyCertificate,
} = require('../controllers/certificateController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router
    .route('/')
    .post(protect, authorize('doctor', 'hospital_admin'), createCertificate)
    .get(protect, getMyCertificates);

router.post('/verify', verifyCertificate);

module.exports = router;
