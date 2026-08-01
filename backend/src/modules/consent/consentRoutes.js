const express = require('express');
const router = express.Router();
const {
    grantDoctorAccess,
    revokeDoctorAccess,
    grantInsuranceAccess,
    revokeConsentById,
    getMyConsents,
} = require('./consentController');
const { protect } = require('../../../middlewares/authMiddleware');

router.use(protect);

router.get('/', getMyConsents);
router.post('/grant-doctor', grantDoctorAccess);
router.post('/revoke-doctor', revokeDoctorAccess);
router.post('/grant-insurance', grantInsuranceAccess);
router.put('/:id/revoke', revokeConsentById);

module.exports = router;
