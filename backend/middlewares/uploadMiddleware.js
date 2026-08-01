const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists locally
const uploadDir = path.join(__dirname, '../uploads/medical_files');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration (Stores files locally first)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        const sanitizeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${sanitizeName}-${uniqueSuffix}${ext}`);
    },
});

// File Filter for Medical Documents & Imaging (MRI, CT Scan, X-ray, Ultrasound, PDF)
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/tiff',
        'application/dicom',
        'application/octet-stream', // Generic binary for DICOM files
    ];

    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.dcm', '.dicom'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed formats: PDF, PNG, JPG, WEBP, TIFF, DICOM (.dcm) for MRI, CT Scan, X-ray, Ultrasound, and PDF reports.`));
    }
};

// Multer Upload Instance
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB limit
    },
    fileFilter: fileFilter,
});

module.exports = upload;
