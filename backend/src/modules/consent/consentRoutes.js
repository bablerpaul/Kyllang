const express = require('express');
const router = express.Router();
const {
    grantDoctorAccess,
    revokeDoctorAccess,
    grantInsuranceAccess,
    revokeConsentById,
    getMyConsents,
} = require('./consentController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

router.use(protect);

// Consent is the PATIENT's decision. These endpoints act as the authenticated patient
// (the controller derives the patient from the session), so they are patient-only:
// a doctor, insurance officer or admin cannot grant/revoke consent on a patient's behalf.
router.get('/', authorize('general_user'), getMyConsents);
router.post('/grant-doctor', authorize('general_user'), grantDoctorAccess);
router.post('/revoke-doctor', authorize('general_user'), revokeDoctorAccess);
router.post('/grant-insurance', authorize('general_user'), grantInsuranceAccess);

// Revoke by id: the owning patient, or an administrator (the controller enforces ownership for non-admins).
router.put('/:id/revoke', authorize('general_user', 'hospital_admin', 'admin'), revokeConsentById);

module.exports = router;
