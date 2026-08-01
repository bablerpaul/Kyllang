const express = require('express');
const router = express.Router();
const {
    getMedicalRecord,
    updateMedicalRecord,
    getAppointments,
    createAppointment,
    getPrescriptions,
    createPrescription,
    getLabReports,
    createLabReport,
} = require('./emrController');
const {
    createEMR,
    getAllEMRs,
    getPatientEMRs,
    getEMRById,
    updateEMR,
    deleteEMR,
} = require('./emrRecordController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

router.use(protect);

// Full EMR Record CRUD Endpoints
router.route('/')
    .get(getAllEMRs)
    .post(authorize('doctor', 'hospital_admin'), createEMR);

router.get('/patient/:patientId', getPatientEMRs);

router.route('/:id')
    .get(getEMRById)
    .put(authorize('doctor', 'hospital_admin'), updateEMR)
    .delete(authorize('doctor', 'hospital_admin'), deleteEMR);

// Existing Legacy EMR Aliases & Domains (Preserved 100%)
router.get('/records', getMedicalRecord);
router.get('/records/:patientId', getMedicalRecord);
router.post('/records/:patientId', authorize('doctor', 'hospital_admin'), updateMedicalRecord);

// Appointments
router.get('/appointments', getAppointments);
router.post('/appointments', createAppointment);

// Prescriptions
router.get('/prescriptions', getPrescriptions);
router.post('/prescriptions', authorize('doctor'), createPrescription);

// Lab Reports
router.get('/lab-reports', getLabReports);
router.post('/lab-reports', authorize('doctor', 'hospital_admin'), createLabReport);

module.exports = router;
