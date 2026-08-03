const { body } = require('express-validator');

exports.emrDiagnosisRules = () => {
    return [
        body('diagnosis').notEmpty().withMessage('Diagnosis is required')
    ];
};

exports.emrNotesRules = () => {
    return [
        body('notes').notEmpty().withMessage('Notes are required')
    ];
};
