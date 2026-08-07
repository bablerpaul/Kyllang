/**
 * validateUploadLinks
 * @description Handles operations for validateUploadLinks. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {*} Return value
 */
exports.validateUploadLinks = (req, res, next) => {
    const { patientId, documentType, linkedEMR, linkedCertificate, linkedInsurance } = req.body;

    if (!patientId || !documentType) {
        return res.status(400).json({
            success: true,
            message: 'patientId and documentType are required',
            data: {}
        });
    }

    if (!linkedEMR && !linkedCertificate && !linkedInsurance) {
        return res.status(400).json({
            success: true,
            message: 'A Secure File must be linked to at least one of the following: linkedEMR, linkedCertificate, or linkedInsurance',
            data: {}
        });
    }

    next();
};