const { body } = require('express-validator');

exports.certificateIssueRules = () => {
    return [
        body('patientId').notEmpty().withMessage('Patient ID is required'),
        body('diagnosis').notEmpty().withMessage('Diagnosis is required'),
        body('validFrom').optional().isISO8601().withMessage('validFrom must be a valid ISO8601 date'),
        body('validUntil').optional().isISO8601().withMessage('validUntil must be a valid ISO8601 date')
    ];
};
