const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const LabReport = require('./models/LabReport');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');
const AuditLog = require('./models/AuditLog');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    
    const mriId = '6ab6c5bf1d831242a5b0e859';
    const secureFileId = '6ab6c5bf1d831242a5b0e85a';
    const expectedProfileId = '6a9c2ec0b8faba626c6f8bb0';
    const expectedUserId = '6a9c2ec0b8faba626c6f8baf';

    // 1. Verify Existing Lab Report
    const labReport = await LabReport.findById(mriId).lean();
    
    // 2. Verify Existing SecureFile
    const secureFile = await SecureFile.findById(secureFileId).lean();
    
    // 3. Verify Doctor Identities
    const docProfile = await Doctor.findById(expectedProfileId).lean();
    const docUser = await User.findById(expectedUserId).select('name email role').lean();
    
    // 4. Verify FileVersion Semantics
    const fileVersion = await FileVersion.findOne({ secureFile: secureFileId }).lean();
    
    // 5. Verify Audit Log Pattern
    const uploadLogs = await AuditLog.find({ action: 'UPLOADED', resource: 'SecureFile' }).limit(5).lean();
    
    // 6. Verify Counts
    const counts = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        LabReports: await LabReport.countDocuments(),
        SecureFiles: await SecureFile.countDocuments(),
        FileVersions: await FileVersion.countDocuments(),
        AuditLogs: await AuditLog.countDocuments()
    };
    
    // 7. Verify no other SecureFile doctor mismatches
    // Find all SecureFiles linked to LabReports
    const linkedSecureFiles = await SecureFile.find({ linkedLabReport: { $exists: true, $ne: null } }).lean();
    let matchCount = 0;
    let mismatchCount = 0;
    const mismatches = [];
    
    for (const sf of linkedSecureFiles) {
        const lr = await LabReport.findById(sf.linkedLabReport).lean();
        if (lr) {
            if (String(lr.doctor) === String(sf.doctor)) {
                matchCount++;
            } else {
                mismatchCount++;
                mismatches.push({
                    secureFileId: sf._id,
                    labReportId: lr._id,
                    sfDoctor: sf.doctor,
                    lrDoctor: lr.doctor
                });
            }
        }
    }
    
    console.log(JSON.stringify({
        labReport: {
            id: labReport._id,
            doctor: labReport.doctor,
            patient: labReport.patient,
            secureFile: labReport.secureFile,
            testName: labReport.testName,
            investigationCategory: labReport.investigationCategory,
            testCategory: labReport.testCategory,
            creationMode: labReport.creationMode,
            hash: labReport.reportHash,
            matchesExpectedProfile: String(labReport.doctor) === expectedProfileId
        },
        secureFile: {
            id: secureFile._id,
            doctor: secureFile.doctor,
            uploader: secureFile.uploader, // note: not in schema, checking if it exists
            patient: secureFile.patient,
            linkedLabReport: secureFile.linkedLabReport,
            isActive: secureFile.isActive,
            matchesExpectedUser: String(secureFile.doctor) === expectedUserId
        },
        identities: {
            profile: {
                id: docProfile._id,
                userRef: docProfile.user
            },
            user: {
                id: docUser._id,
                name: docUser.name,
                email: docUser.email,
                role: docUser.role
            },
            sameAccount: String(docProfile.user) === String(docUser._id)
        },
        fileVersion: {
            id: fileVersion._id,
            uploadedBy: fileVersion.uploadedBy,
            secureFile: fileVersion.secureFile,
            blockchainStatus: fileVersion.blockchainStatus,
            transactionHash: fileVersion.blockchainTransactionHash,
            matchesExpectedUser: String(fileVersion.uploadedBy) === expectedUserId
        },
        uploadLogs,
        counts,
        mismatchAudit: {
            totalLinked: linkedSecureFiles.length,
            matches: matchCount,
            mismatches: mismatchCount,
            mismatchRecords: mismatches
        }
    }, null, 2));

    process.exit(0);
}
run().catch(console.error);
