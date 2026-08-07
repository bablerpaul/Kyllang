const User = require('../../models/User');
const Patient = require('../../models/Patient');
const Doctor = require('../../models/Doctor');
const MedicalRecord = require('../../models/MedicalRecord');
const Prescription = require('../../models/Prescription');
const LabReport = require('../../models/LabReport');
const Appointment = require('../../models/Appointment');
const InsuranceClaim = require('../../models/InsuranceClaim');
const Certificate = require('../../models/Certificate');
const AuditLog = require('../../models/AuditLog');
const Consent = require('../../models/Consent');
const PatientDocument = require('../../models/PatientDocument');
const CertificateRequest = require('../../models/CertificateRequest');

module.exports = {
    User,
    Patient,
    Doctor,
    MedicalRecord,
    Prescription,
    LabReport,
    Appointment,
    InsuranceClaim,
    Certificate,
    MedicalCertificate: Certificate, // Alias for legacy references
    AuditLog,
    Consent,
    PatientDocument,
    CertificateRequest,
};
