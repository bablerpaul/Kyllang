const express = require('express');
const router = express.Router();
const {
    createLabReport,
    getAllLabReports,
    getLabReportsByVisit,
    getLabReportsByPatient,
    getLabReportById,
    updateLabReport,
    deleteLabReport,
} = require('./labReportController');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

router.use(protect);

router.route('/')
    .get(getAllLabReports)
    .post(authorize('doctor', 'hospital_admin'), createLabReport);

router.get('/visit/:visitId', getLabReportsByVisit);
router.get('/patient/:patientId', getLabReportsByPatient);

router.route('/:id')
    .get(getLabReportById)
    .put(authorize('doctor', 'hospital_admin'), updateLabReport)
    .delete(authorize('doctor', 'hospital_admin'), deleteLabReport);

module.exports = router;
