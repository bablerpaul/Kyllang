const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const storageController = require('../controllers/storageController');
const { protect } = require('../../../../middlewares/authMiddleware');
const { cacheRoute } = require('../../../middlewares/cacheMiddleware');

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
            cb(new Error('Unsupported file type. Only PDF, PNG, JPG, JPEG, and DICOM are allowed.'));
        }
    }
});

const { validateUploadLinks } = require('../middleware/uploadValidation');
const { uploadLimiter, verifyLimiter, downloadLimiter } = require('../../../../middlewares/rateLimiter');
const { storageUploadRules } = require('../../../../validators/storageValidator');
const { validate } = require('../../../../middlewares/validatorMiddleware');

router.get('/', protect, storageController.listFiles);
router.get('/stats', protect, storageController.getStorageStats);
router.post('/upload', protect, uploadLimiter, upload.single('file'), storageUploadRules(), validate, validateUploadLinks, storageController.uploadDocument);
router.get('/view/:id', protect, storageController.viewDocument);
router.get('/download/:id', protect, downloadLimiter, storageController.downloadDocument);
router.get('/verify/:id', protect, verifyLimiter, cacheRoute('storage_verify', 86400), storageController.verifyIntegrity);
router.delete('/:id', protect, storageController.deleteDocument);

module.exports = router;
