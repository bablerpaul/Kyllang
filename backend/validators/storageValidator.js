const { body } = require('express-validator');

exports.storageUploadRules = () => {
    return [
        body('documentType').notEmpty().withMessage('Document type is required'),
        body('patientId').notEmpty().withMessage('Patient ID is required')
    ];
};
