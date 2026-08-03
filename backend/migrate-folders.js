const fs = require('fs');
const path = require('path');

const BACKEND_DIR = __dirname;
const SRC_MODULES_DIR = path.join(BACKEND_DIR, 'src', 'modules');

const mappings = {
    // Auth
    'controllers/authController.js': 'src/modules/auth/authController.js',
    'routes/authRoutes.js': 'src/modules/auth/authRoutes.js',
    
    // Admin
    'controllers/adminController.js': 'src/modules/admin/adminController.js',
    'routes/adminRoutes.js': 'src/modules/admin/adminRoutes.js',
    
    // Patient
    'controllers/patientController.js': 'src/modules/patients/patientController.js',
    'routes/patientRoutes.js': 'src/modules/patients/patientRoutes.js',
    'models/Patient.js': 'src/modules/patients/models/Patient.js',
    'models/PatientDocument.js': 'src/modules/patients/models/PatientDocument.js',
    
    // Doctor
    'controllers/doctorController.js': 'src/modules/doctors/doctorController.js',
    'routes/doctorRoutes.js': 'src/modules/doctors/doctorRoutes.js',
    'models/Doctor.js': 'src/modules/doctors/models/Doctor.js',
    
    // Certificate
    'controllers/certificateController.js': 'src/modules/certificates/certificateController.js',
    'routes/certificateRoutes.js': 'src/modules/certificates/certificateRoutes.js',
    'models/Certificate.js': 'src/modules/certificates/models/Certificate.js',
    'models/CertificateRequest.js': 'src/modules/certificates/models/CertificateRequest.js',
    
    // Core Models
    'models/User.js': 'src/modules/auth/models/User.js',
    'models/AuditLog.js': 'src/modules/admin/models/AuditLog.js',
    
    // Uploads
    'controllers/uploadController.js': 'src/modules/secure-storage/controllers/uploadController.js',
    'routes/uploadRoutes.js': 'src/modules/secure-storage/routes/uploadRoutes.js',
    
    // The rest of the models can stay in a shared core or go to their respective domains
    'models/Appointment.js': 'src/modules/patients/models/Appointment.js',
    'models/Consent.js': 'src/modules/consent/models/Consent.js',
    'models/InsuranceClaim.js': 'src/modules/insurance/models/InsuranceClaim.js',
    'models/LabReport.js': 'src/modules/lab/models/LabReport.js',
    'models/MedicalRecord.js': 'src/modules/emr/models/MedicalRecord.js',
    'models/Prescription.js': 'src/modules/prescriptions/models/Prescription.js',
    // 'models/MedicalCertificate.js' -> already have Certificate.js. Let's see if we should delete duplicate model.
};

function copyFiles() {
    for (const [oldRel, newRel] of Object.entries(mappings)) {
        const oldPath = path.join(BACKEND_DIR, oldRel);
        const newPath = path.join(BACKEND_DIR, newRel);
        
        if (fs.existsSync(oldPath)) {
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.renameSync(oldPath, newPath);
            console.log(`Moved ${oldRel} -> ${newRel}`);
        } else {
            console.log(`Missing: ${oldRel}`);
        }
    }
}

// Just printing for now to be safe. We need to rewrite require statements first.
console.log("Ready to migrate files.");
