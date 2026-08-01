const LabReport = require('../../../models/LabReport');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');

// Helper to resolve Patient Document ID
const resolvePatientId = async (idInput) => {
    let patient = await Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!patient) {
        const userExists = await User.findById(idInput);
        if (userExists) {
            patient = await Patient.create({ user: idInput });
        }
    }
    return patient ? patient._id : idInput;
};

// Helper to resolve Doctor Document ID
const resolveDoctorId = async (idInput) => {
    let doctor = await Doctor.findOne({ $or: [{ _id: idInput }, { user: idInput }] });
    if (!doctor) {
        doctor = await Doctor.create({
            user: idInput,
            specialty: 'General Medicine',
            licenseNumber: `DOC-${idInput.toString().substring(18)}`,
        });
    }
    return doctor ? doctor._id : idInput;
};

// @desc    Create a new Lab Report
// @route   POST /api/lab-reports
// @access  Private (Doctor or Hospital Admin only)
exports.createLabReport = async (req, res) => {
    try {
        const { patientId, patient, testCategory, testName, results, overallSummary, pdfUrl, fileUrl, visitId, visit, medicalRecord, status } = req.body;

        const targetPatientInput = patientId || patient;
        const targetVisitInput = visitId || visit || medicalRecord;

        if (!targetPatientInput || !testCategory || !testName) {
            return res.status(400).json({ message: 'Patient reference, test category, and test name are required' });
        }

        const validCategories = ['Blood Test', 'Urine Test', 'MRI', 'CT Scan', 'ECG', 'X-ray', 'Ultrasound', 'General Pathology', 'Other'];
        if (!validCategories.includes(testCategory)) {
            return res.status(400).json({ message: `testCategory must be one of: ${validCategories.join(', ')}` });
        }

        let resolvedPatientId = await resolvePatientId(targetPatientInput);
        let emrDoc;

        if (targetVisitInput) {
            emrDoc = await MedicalRecord.findById(targetVisitInput);
            if (emrDoc && !resolvedPatientId) {
                resolvedPatientId = emrDoc.patient;
            }
        }

        const resolvedDoctorId = await resolveDoctorId(req.user._id);

        const reportContent = `${resolvedPatientId}|${resolvedDoctorId}|${testCategory}|${testName}|${JSON.stringify(results || [])}|${Date.now()}`;
        const reportHash = crypto.createHash('sha256').update(reportContent).digest('hex');

        const labReport = await LabReport.create({
            patient: resolvedPatientId,
            orderedBy: resolvedDoctorId,
            doctor: resolvedDoctorId,
            medicalRecord: targetVisitInput || undefined,
            visit: targetVisitInput || undefined,
            testCategory,
            testName,
            results: results || [],
            overallSummary: overallSummary || 'Lab test completed',
            pdfUrl: pdfUrl || fileUrl || undefined,
            fileUrl: fileUrl || pdfUrl || undefined,
            status: status || 'completed',
            reportHash,
        });

        const populatedReport = await LabReport.findById(labReport._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate');

        // Store Audit Log for CREATED action
        await logAudit({
            req,
            action: 'CREATED',
            resource: 'LabReport',
            resourceId: labReport._id,
            hash: reportHash,
            details: { testCategory, testName, patientId: resolvedPatientId }
        });

        res.status(201).json({
            success: true,
            message: 'Lab Report created successfully',
            labReport: populatedReport,
        });
    } catch (error) {
        console.error('Error in createLabReport:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all Lab Reports
// @route   GET /api/lab-reports
// @access  Private
exports.getAllLabReports = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === 'general_user') {
            const patientDoc = await Patient.findOne({ user: req.user._id });
            const pId = patientDoc ? patientDoc._id : req.user._id;
            filter = { $or: [{ patient: pId }, { patient: req.user._id }] };
        } else if (req.query.patientId) {
            const pId = await resolvePatientId(req.query.patientId);
            filter = { $or: [{ patient: pId }, { patient: req.query.patientId }] };
        } else if (req.query.testCategory) {
            filter.testCategory = req.query.testCategory;
        }

        const reports = await LabReport.find(filter)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            details: { count: reports.length }
        });

        res.status(200).json(reports);
    } catch (error) {
        console.error('Error in getAllLabReports:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Lab Reports by Visit / Medical Record ID
// @route   GET /api/lab-reports/visit/:visitId
// @access  Private
exports.getLabReportsByVisit = async (req, res) => {
    try {
        const { visitId } = req.params;
        const reports = await LabReport.find({
            $or: [{ visit: visitId }, { medicalRecord: visitId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: visitId,
            details: { type: 'get_by_visit', count: reports.length }
        });

        res.status(200).json(reports);
    } catch (error) {
        console.error('Error in getLabReportsByVisit:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Lab Reports by Patient ID
// @route   GET /api/lab-reports/patient/:patientId
// @access  Private
exports.getLabReportsByPatient = async (req, res) => {
    try {
        const pId = await resolvePatientId(req.params.patientId);
        const reports = await LabReport.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 });

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: req.params.patientId,
            details: { type: 'get_by_patient', count: reports.length }
        });

        res.status(200).json(reports);
    } catch (error) {
        console.error('Error in getLabReportsByPatient:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single Lab Report by ID
// @route   GET /api/lab-reports/:id
// @access  Private
exports.getLabReportById = async (req, res) => {
    try {
        const report = await LabReport.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate');

        if (!report) {
            return res.status(404).json({ message: 'Lab Report not found' });
        }

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: report._id,
            hash: report.reportHash,
            details: { testCategory: report.testCategory, testName: report.testName }
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('Error in getLabReportById:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Lab Report
// @route   PUT /api/lab-reports/:id
// @access  Private (Doctor or Hospital Admin only)
exports.updateLabReport = async (req, res) => {
    try {
        const { testCategory, testName, results, overallSummary, pdfUrl, fileUrl, status } = req.body;

        let report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Lab Report not found' });
        }

        if (testCategory !== undefined) report.testCategory = testCategory;
        if (testName !== undefined) report.testName = testName;
        if (results !== undefined) report.results = results;
        if (overallSummary !== undefined) report.overallSummary = overallSummary;
        if (pdfUrl !== undefined) report.pdfUrl = pdfUrl;
        if (fileUrl !== undefined) report.fileUrl = fileUrl;
        if (status !== undefined) report.status = status;

        const reportContent = `${report.patient}|${report.orderedBy}|${report.testCategory}|${report.testName}|${JSON.stringify(report.results)}|${Date.now()}`;
        report.reportHash = crypto.createHash('sha256').update(reportContent).digest('hex');

        await report.save();

        const updated = await LabReport.findById(report._id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate');

        // Store Audit Log for UPDATED action
        await logAudit({
            req,
            action: 'UPDATED',
            resource: 'LabReport',
            resourceId: report._id,
            hash: report.reportHash,
            details: { testCategory: report.testCategory, status: report.status }
        });

        res.status(200).json({
            success: true,
            message: 'Lab Report updated successfully',
            labReport: updated,
        });
    } catch (error) {
        console.error('Error in updateLabReport:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete Lab Report
// @route   DELETE /api/lab-reports/:id
// @access  Private (Doctor or Hospital Admin only)
exports.deleteLabReport = async (req, res) => {
    try {
        const report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Lab Report not found' });
        }

        const reportHash = report.reportHash;
        await LabReport.findByIdAndDelete(req.params.id);

        // Store Audit Log for DELETED action
        await logAudit({
            req,
            action: 'DELETED',
            resource: 'LabReport',
            resourceId: req.params.id,
            hash: reportHash,
            details: { type: 'delete_lab_report' }
        });

        res.status(200).json({
            success: true,
            message: 'Lab Report deleted successfully',
        });
    } catch (error) {
        console.error('Error in deleteLabReport:', error);
        res.status(500).json({ message: error.message });
    }
};
