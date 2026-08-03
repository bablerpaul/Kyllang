const { body } = require('express-validator');

exports.insuranceClaimRules = () => {
    return [
        body('provider').notEmpty().withMessage('Provider is required'),
        body('policyNumber').notEmpty().withMessage('Policy number is required'),
        body('claimAmount').isNumeric().withMessage('Claim amount must be a number')
    ];
};
