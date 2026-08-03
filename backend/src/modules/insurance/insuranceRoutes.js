const express = require('express');
const router = express.Router();
const { cacheRoute } = require('../../../middlewares/cacheMiddleware');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const tempUploadsDir = path.join(__dirname, '../../../../uploads/temp');
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
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/dicom'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    }
});
const {
    submitClaim,
    getAllClaims,
    getPatientClaimHistory,
    getClaimById,
    verifyClaimCertificate,
    verifyClaimBlockchainHash,
    approveClaim,
    rejectClaim,
    uploadClaimDocument,
    getClaimDocuments,
    downloadClaimDocument,
} = require('./insuranceController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');
const { uploadLimiter, verifyLimiter, downloadLimiter } = require('../../../middlewares/rateLimiter');
const { insuranceClaimRules } = require('../../../validators/insuranceValidator');
const { validate } = require('../../../middlewares/validatorMiddleware');

router.use(protect);

router.route('/claims')
    .get(getAllClaims)
    .post(insuranceClaimRules(), validate, submitClaim);

router.get('/claims/patient/:patientId', getPatientClaimHistory);

router.get('/claims/:id', getClaimById);

// Verification Endpoints
router.post('/claims/:id/verify-certificate', verifyLimiter, verifyClaimCertificate);
router.post('/claims/:id/verify-blockchain', verifyLimiter, cacheRoute('blockchain_verify_claim', 86400), verifyClaimBlockchainHash);

// Claim Adjudication Endpoints (Approve / Reject)
router.put('/claims/:id/approve', authorize('admin', 'hospital_admin', 'doctor'), approveClaim);
router.put('/claims/:id/reject', authorize('admin', 'hospital_admin', 'doctor'), rejectClaim);

// Secure Storage Integration for Claims
router.post('/claims/:id/upload', authorize('admin', 'hospital_admin', 'doctor', 'insurance_officer'), uploadLimiter, upload.single('file'), uploadClaimDocument);
router.get('/claims/:id/documents', getClaimDocuments);
router.get('/claims/:id/documents/:fileId/download', authorize('admin', 'hospital_admin', 'doctor', 'insurance_officer'), downloadLimiter, downloadClaimDocument);

module.exports = router;
