const express = require('express');
const router = express.Router();
const {
    createPrescription,
    getAllPrescriptions,
    getPrescriptionById,
    getPrescriptionsByEmr,
    getPrescriptionsByPatient,
    updatePrescription,
    deletePrescription,
} = require('./prescriptionController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

router.use(protect);

router.route('/')
    .get(getAllPrescriptions)
    .post(authorize('doctor', 'hospital_admin'), createPrescription);

router.get('/emr/:emrId', getPrescriptionsByEmr);
router.get('/patient/:patientId', getPrescriptionsByPatient);

router.route('/:id')
    .get(getPrescriptionById)
    .put(authorize('doctor', 'hospital_admin'), updatePrescription)
    .delete(authorize('doctor', 'hospital_admin'), deletePrescription);

module.exports = router;
