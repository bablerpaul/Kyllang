const { body } = require('express-validator');

exports.patientRegisterRules = () => {
    return [
        body('name').notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    ];
};

exports.doctorRegisterRules = () => {
    return [
        body('name').notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
        body('specialty').notEmpty().withMessage('Specialty is required'),
        body('licenseNumber').notEmpty().withMessage('License number is required'),
    ];
};
