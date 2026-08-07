const LabReport = require('../../../models/LabReport');
const MedicalRecord = require('../../../models/MedicalRecord');
const Patient = require('../../../models/Patient');
const Doctor = require('../../../models/Doctor');
const User = require('../../../models/User');
const { logAudit } = require('../../../utils/auditLogger');
const crypto = require('crypto');

/**
 * resolvePatientId
 * @description Handles operations for resolvePatientId. Explains parameters, return values and usage.
 * @param {*} idInput - idInput parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
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

/**
 * resolveDoctorId
 * @description Handles operations for resolveDoctorId. Explains parameters, return values and usage.
 * @param {*} idInput - idInput parameter
 * @returns {Promise<void>} Resolves when the operation is complete
 */
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

/**
 * createLabReport
 * @description Handles operations for createLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.createLabReport = async (req, res, next) => {
    try {
        const { patientId, patient, testCategory, testName, results, overallSummary, pdfUrl, fileUrl, visitId, visit, medicalRecord, status } = req.body;

        const targetPatientInput = patientId || patient;
        const targetVisitInput = visitId || visit || medicalRecord;

        if (!targetPatientInput || !testCategory || !testName) {
            return res.status(400).json({ success: false, message: 'Patient reference, test category, and test name are required' , error: 'Patient reference, test category, and test name are required'  });
        }

        const validCategories = ['Blood Test', 'Urine Test', 'MRI', 'CT Scan', 'ECG', 'X-ray', 'Ultrasound', 'General Pathology', 'Other'];
        if (!validCategories.includes(testCategory)) {
            return res.status(400).json({
                success: true,
                message: `testCategory must be one of: ${validCategories.join(', ')}`,
                data: {}
            });
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
            .populate('visit', 'diagnosis visitDate')
            .lean();

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

            data: {
                labReport: populatedReport
            }
        });
    } catch (error) {
        console.error('Error in createLabReport:', error);
        next(error);
    }
};

/**
 * getAllLabReports
 * @description Handles operations for getAllLabReports. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getAllLabReports = async (req, res, next) => {
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
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            details: { count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getAllLabReports:', error);
        next(error);
    }
};

/**
 * getLabReportsByVisit
 * @description Handles operations for getLabReportsByVisit. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportsByVisit = async (req, res, next) => {
    try {
        const { visitId } = req.params;
        const reports = await LabReport.find({
            $or: [{ visit: visitId }, { medicalRecord: visitId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: visitId,
            details: { type: 'get_by_visit', count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getLabReportsByVisit:', error);
        next(error);
    }
};

/**
 * getLabReportsByPatient
 * @description Handles operations for getLabReportsByPatient. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportsByPatient = async (req, res, next) => {
    try {
        const pId = await resolvePatientId(req.params.patientId);
        const reports = await LabReport.find({
            $or: [{ patient: pId }, { patient: req.params.patientId }]
        })
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .sort({ createdAt: -1 })
            .lean();

        // Store Audit Log for VIEWED action
        await logAudit({
            req,
            action: 'VIEWED',
            resource: 'LabReport',
            resourceId: req.params.patientId,
            details: { type: 'get_by_patient', count: reports.length }
        });

        res.status(200).json({ success: true, message: 'Operation successful', data: reports });
    } catch (error) {
        console.error('Error in getLabReportsByPatient:', error);
        next(error);
    }
};

/**
 * getLabReportById
 * @description Handles operations for getLabReportById. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getLabReportById = async (req, res, next) => {
    try {
        const report = await LabReport.findById(req.params.id)
            .populate({ path: 'patient', populate: { path: 'user', select: 'name email' } })
            .populate({ path: 'orderedBy', populate: { path: 'user', select: 'name email' } })
            .populate('visit', 'diagnosis visitDate')
            .lean();

        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
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

        res.status(200).json({ success: true, message: 'Operation successful', data: report });
    } catch (error) {
        console.error('Error in getLabReportById:', error);
        next(error);
    }
};

/**
 * updateLabReport
 * @description Handles operations for updateLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.updateLabReport = async (req, res, next) => {
    try {
        const { testCategory, testName, results, overallSummary, pdfUrl, fileUrl, status } = req.body;

        let report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
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
            .populate('visit', 'diagnosis visitDate')
            .lean();

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

            data: {
                labReport: updated
            }
        });
    } catch (error) {
        console.error('Error in updateLabReport:', error);
        next(error);
    }
};

/**
 * deleteLabReport
 * @description Handles operations for deleteLabReport. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.deleteLabReport = async (req, res, next) => {
    try {
        const report = await LabReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab Report not found' , error: 'Lab Report not found'  });
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
            data: {}
        });
    } catch (error) {
        console.error('Error in deleteLabReport:', error);
        next(error);
    }
};
