const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const { uploadSingleFile, uploadMultipleFiles } = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

// Single file upload route (MRI, CT Scan, X-ray, Ultrasound, PDF)
router.post('/single', upload.single('file'), uploadSingleFile);

// Multiple files upload route
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);

module.exports = router;
