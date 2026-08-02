const express = require('express');
const router = express.Router();
const multer = require('multer');
const storageController = require('../controllers/storageController');
const { protect } = require('../middleware/storageMiddleware');

const upload = multer({
    storage: multer.memoryStorage(),
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

router.post('/upload', protect, upload.single('file'), storageController.uploadDocument);
router.post('/retrieve/:id', protect, storageController.retrieveDocument);
router.get('/verify/:id', protect, storageController.verifyIntegrity);

module.exports = router;
