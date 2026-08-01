const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AuditLog = require('../models/AuditLog');
const { uploadToIPFS } = require('../services/ipfsService');

// @desc    Upload Single Medical File to IPFS (MRI, CT Scan, X-ray, Ultrasound, PDF)
// @route   POST /api/upload/single
// @access  Private
exports.uploadSingleFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded or invalid file format' });
        }

        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // Calculate SHA-256 file hash for cryptographic integrity
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Upload to IPFS & receive CID
        const { cid, ipfsUrl, gatewayUrl } = await uploadToIPFS(fileBuffer, req.file.filename);

        // Remove local temporary file immediately so large files are NOT stored locally
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (cleanupErr) {
            console.warn('Temporary file cleanup warning:', cleanupErr.message);
        }

        if (req.user) {
            await AuditLog.create({
                actor: req.user._id,
                action: 'OTHER',
                details: { type: 'ipfs_upload', fileName: req.file.originalname, ipfsCid: cid, fileHash }
            });
        }

        res.status(200).json({
            success: true,
            message: 'File uploaded to IPFS successfully. CID stored in metadata.',
            file: {
                originalName: req.file.originalname,
                fileName: req.file.filename,
                ipfsCid: cid,
                cid: cid,
                ipfsUrl: ipfsUrl,
                gatewayUrl: gatewayUrl,
                mimeType: req.file.mimetype,
                size: req.file.size,
                fileHash: fileHash,
                uploadedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('Error in uploadSingleFile:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Upload Multiple Medical Files to IPFS
// @route   POST /api/upload/multiple
// @access  Private
exports.uploadMultipleFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const uploadedFiles = [];

        for (const file of req.files) {
            const fileBuffer = fs.readFileSync(file.path);
            const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            const { cid, ipfsUrl, gatewayUrl } = await uploadToIPFS(fileBuffer, file.filename);

            // Cleanup local temporary file
            try {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr.message);
            }

            uploadedFiles.push({
                originalName: file.originalname,
                fileName: file.filename,
                ipfsCid: cid,
                cid: cid,
                ipfsUrl: ipfsUrl,
                gatewayUrl: gatewayUrl,
                mimeType: file.mimetype,
                size: file.size,
                fileHash: fileHash,
                uploadedAt: new Date().toISOString(),
            });
        }

        res.status(200).json({
            success: true,
            message: `${uploadedFiles.length} files uploaded to IPFS successfully`,
            files: uploadedFiles,
        });
    } catch (error) {
        console.error('Error in uploadMultipleFiles:', error);
        res.status(500).json({ message: error.message });
    }
};
