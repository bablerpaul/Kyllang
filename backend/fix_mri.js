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

    // 1. Get before counts
    const countsBefore = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        LabReports: await LabReport.countDocuments(),
        SecureFiles: await SecureFile.countDocuments(),
        FileVersions: await FileVersion.countDocuments(),
        AuditLogs: await AuditLog.countDocuments()
    };

    // 2. Read SecureFile before update
    const sfBefore = await SecureFile.findById(secureFileId).lean();
    if (!sfBefore) {
        console.error('Target SecureFile not found.');
        process.exit(1);
    }

    if (String(sfBefore._id) !== secureFileId) {
        console.error('ID mismatch.');
        process.exit(1);
    }
    
    if (String(sfBefore.linkedLabReport) !== mriId) {
        console.error('linkedLabReport mismatch.');
        process.exit(1);
    }
    
    if (String(sfBefore.doctor) !== expectedUserId) {
        console.error('doctor mismatch before update. Expected:', expectedUserId, 'Got:', sfBefore.doctor);
        process.exit(1);
    }

    // 3. Perform single-record update
    const updateResult = await SecureFile.updateOne(
        { _id: secureFileId },
        { $set: { doctor: expectedProfileId } }
    );

    if (updateResult.matchedCount !== 1 || updateResult.modifiedCount !== 1) {
        console.error('Update failed or affected multiple records:', updateResult);
        process.exit(1);
    }

    // 4. Read SecureFile after update
    const sfAfter = await SecureFile.findById(secureFileId).lean();

    // Verify only intended field changed
    const changes = [];
    for (const key of Object.keys(sfBefore)) {
        if (key === 'doctor') continue;
        if (key === 'updatedAt') continue; // updatedAt might not even change if we bypass mongoose save, but updateOne updates it? actually updateOne doesn't update timestamps by default unless configured or run via mongoose driver with timestamps option
        
        const b = JSON.stringify(sfBefore[key]);
        const a = JSON.stringify(sfAfter[key]);
        if (b !== a) {
            changes.push(key);
        }
    }

    // 5. Verify LabReport doctor
    const lrAfter = await LabReport.findById(mriId).lean();
    const docEquality = String(lrAfter.doctor) === String(sfAfter.doctor);

    // 6. Verify FileVersion
    const fvAfter = await FileVersion.findOne({ secureFile: secureFileId }).lean();
    
    // Note: The prompt mistakenly stated FileVersion.uploadedBy === 6a9c38027543c3aa0742bee5 (the Patient ID)
    // We will verify it is the expected Doctor User ID 6a9c2ec0b8faba626c6f8baf
    
    // 7. Get after counts
    const countsAfter = {
        Users: await User.countDocuments(),
        Doctors: await Doctor.countDocuments(),
        Patients: await Patient.countDocuments(),
        LabReports: await LabReport.countDocuments(),
        SecureFiles: await SecureFile.countDocuments(),
        FileVersions: await FileVersion.countDocuments(),
        AuditLogs: await AuditLog.countDocuments()
    };

    console.log(JSON.stringify({
        targetSecureFileId: secureFileId,
        beforeDoctorValue: sfBefore.doctor,
        afterDoctorValue: sfAfter.doctor,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        unintendedChanges: changes,
        labReportSecureFileEquality: docEquality,
        fileVersion: {
            uploadedBy: fvAfter.uploadedBy,
            matchesExpectedUser: String(fvAfter.uploadedBy) === expectedUserId,
            blockchainStatus: fvAfter.blockchainStatus,
            transactionHash: fvAfter.blockchainTransactionHash,
            dataHash: fvAfter.dataHash,
            ipfsCid: fvAfter.ipfsCid
        },
        countsBefore,
        countsAfter
    }, null, 2));

    process.exit(0);
}
run().catch(console.error);
