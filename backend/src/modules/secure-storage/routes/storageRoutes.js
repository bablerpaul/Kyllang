const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const storageController = require('../controllers/storageController');
const { protect } = require('../../../../middlewares/authMiddleware');

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
        const allowedMimeTypes = [
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'application/dicom'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const err = new Error('Unsupported file type. Only PDF, PNG, JPG, JPEG, and DICOM are allowed.');
            err.code = 'UNSUPPORTED_FILE_TYPE';
            cb(err);
        }
    }
});

// multer.single('file') with client errors answered as 400 / success:false (they previously fell through to the global
// error handler as HTTP 500). Rejected requests never reach the controller, so nothing is encrypted, stored or queued
// for anchoring; any partially written temp file is removed. Unexpected (non-client) errors still go to next(err).
const MULTER_CLIENT_MESSAGES = {
    UNSUPPORTED_FILE_TYPE: 'Unsupported file type. Only PDF, PNG, JPG, JPEG, and DICOM are allowed.',
    LIMIT_FILE_SIZE: 'File is too large. The maximum upload size is 20 MB.',
    LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Upload a single file in the "file" field.',
    LIMIT_FILE_COUNT: 'Only one file can be uploaded at a time.',
    LIMIT_PART_COUNT: 'Invalid upload request.',
    LIMIT_FIELD_KEY: 'Invalid upload request.',
    LIMIT_FIELD_VALUE: 'Invalid upload request.',
    LIMIT_FIELD_COUNT: 'Invalid upload request.',
};
const uploadSingleFile = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();
        const message = MULTER_CLIENT_MESSAGES[err.code];
        if (req.file && req.file.path) fs.promises.unlink(req.file.path).catch(() => {});
        if (!message) return next(err);
        return res.status(400).json({ success: false, message, error: message });
    });
};

const { validateUploadLinks } = require('../middleware/uploadValidation');
const { uploadLimiter, verifyLimiter, downloadLimiter } = require('../../../../middlewares/rateLimiter');
const { storageUploadRules } = require('../../../../validators/storageValidator');
const { validate } = require('../../../../middlewares/validatorMiddleware');
const { validateMagicBytes } = require('../utils/magicBytes');

const validateFileContent = async (req, res, next) => {
    if (!req.file) return next();
    try {
        const isValid = await validateMagicBytes(req.file.path, req.file.mimetype);
        if (!isValid) {
            fs.promises.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ success: false, message: 'Invalid file content signature. File may be tampered or malicious.' });
        }
        next();
    } catch (error) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(500).json({ success: false, message: 'File validation failed.' });
    }
};

router.get('/', protect, storageController.listFiles);
router.get('/stats', protect, storageController.getStorageStats);
router.post('/upload', protect, uploadLimiter, uploadSingleFile, validateFileContent, storageUploadRules(), validate, validateUploadLinks, storageController.uploadDocument);
router.get('/view/:id', protect, storageController.viewDocument);
router.get('/download/:id', protect, downloadLimiter, storageController.downloadDocument);
// Verification is deliberately NOT cached. The former cacheRoute('storage_verify', 86400) keyed entries by user id only
// and answered BEFORE the controller's consent check, so a cached result could be served for a different file or after
// consent was revoked (and skipped the audit log). Every verify is authorized, performed and audited afresh.
router.get('/verify/:id', protect, verifyLimiter, storageController.verifyIntegrity);
router.delete('/:id', protect, storageController.deleteDocument);

module.exports = router;
