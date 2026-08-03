const express = require('express');
const router = express.Router();
const { cacheRoute } = require('../src/middlewares/cacheMiddleware');
const {
    createCertificate,
    getMyCertificates,
    verifyCertificate,
} = require('../controllers/certificateController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { certificateVerifyLimiter } = require('../middlewares/rateLimiter');
const { certificateIssueRules } = require('../validators/certificateValidator');
const { validate } = require('../middlewares/validatorMiddleware');

router
    .route('/')
    .post(protect, authorize('doctor', 'hospital_admin'), certificateIssueRules(), validate, createCertificate)
    .get(protect, getMyCertificates);

router.post('/verify', certificateVerifyLimiter, cacheRoute('cert_verify', 86400), verifyCertificate);

module.exports = router;
