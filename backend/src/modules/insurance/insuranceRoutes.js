const express = require('express');
const router = express.Router();
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
    authorizeClaimDocumentUpload,
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

// A malformed claim id gets the handlers' existing not-found reply instead of an unhandled cast error (HTTP 500).

const handleUpload = (req, res, next) => {
    const uploader = upload.single('file');
    uploader(req, res, function (err) {
        if (err) {
            return res.status(400).json({ success: false, message: err.message, error: err.message });
        }
        next();
    });
};

const requireObjectIdParam = (req, res, next) => {
    if (/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return next();
    return res.status(404).json({ success: false, message: 'Insurance claim not found', error: 'Insurance claim not found' });
};

// Verification Endpoints (15.3-A-4: restricted to adjudicating roles)
router.post('/claims/:id/verify-certificate', authorize('admin', 'hospital_admin', 'insurance_officer'), requireObjectIdParam, verifyLimiter, verifyClaimCertificate);
// Deliberately NOT response-cached: authorization and the result are claim-specific and must be evaluated on every request.
router.post('/claims/:id/verify-blockchain', authorize('admin', 'hospital_admin', 'insurance_officer'), requireObjectIdParam, verifyLimiter, verifyClaimBlockchainHash);

// Claim Adjudication Endpoints (Approve / Reject)
router.put('/claims/:id/approve', authorize('admin', 'hospital_admin', 'insurance_officer'), requireObjectIdParam, approveClaim);
router.put('/claims/:id/reject', authorize('admin', 'hospital_admin', 'insurance_officer'), requireObjectIdParam, rejectClaim);

// Secure Storage Integration for Claims
router.post('/claims/:id/upload', authorize('admin', 'hospital_admin', 'doctor', 'insurance_officer'), requireObjectIdParam, authorizeClaimDocumentUpload, uploadLimiter, handleUpload, uploadClaimDocument);
router.get('/claims/:id/documents', getClaimDocuments);
router.get('/claims/:id/documents/:fileId/download', authorize('admin', 'hospital_admin', 'doctor', 'insurance_officer'), downloadLimiter, downloadClaimDocument);

module.exports = router;
