const fs = require('fs');

// Every rejection is a client error: `success: false`, and the multer temp upload is removed so a rejected request
// leaves no file behind in uploads/temp.
const reject = (req, res, message) => {
    if (req.file && req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
    }
    return res.status(400).json({ success: false, message, error: message });
};

/**
 * validateUploadLinks
 * @description Request-shape checks for a Secure Storage upload (presence only — no database access, so nothing about
 * patients or records is revealed before the controller's consent check). Linked-EMR OWNERSHIP is enforced in
 * storageController.uploadDocument, after authorization.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {*} Return value
 */
exports.validateUploadLinks = (req, res, next) => {
    const { patientId, documentType, linkedEMR, linkedCertificate, linkedInsurance } = req.body;

    if (!patientId || !documentType) {
        return reject(req, res, 'patientId and documentType are required');
    }

    if (!linkedEMR && !linkedCertificate && !linkedInsurance) {
        return reject(req, res, 'A Secure File must be linked to at least one of the following: linkedEMR, linkedCertificate, or linkedInsurance');
    }

    next();
};
