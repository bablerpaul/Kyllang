const express = require('express');
const router = express.Router();
const {
    submitClaim,
    getAllClaims,
    getPatientClaimHistory,
    getClaimById,
    verifyClaimCertificate,
    verifyClaimBlockchainHash,
    approveClaim,
    rejectClaim,
} = require('./insuranceController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

router.use(protect);

router.route('/claims')
    .get(getAllClaims)
    .post(submitClaim);

router.get('/claims/patient/:patientId', getPatientClaimHistory);

router.get('/claims/:id', getClaimById);

// Verification Endpoints
router.post('/claims/:id/verify-certificate', verifyClaimCertificate);
router.post('/claims/:id/verify-blockchain', verifyClaimBlockchainHash);

// Claim Adjudication Endpoints (Approve / Reject)
router.put('/claims/:id/approve', authorize('admin', 'hospital_admin', 'doctor'), approveClaim);
router.put('/claims/:id/reject', authorize('admin', 'hospital_admin', 'doctor'), rejectClaim);

module.exports = router;
