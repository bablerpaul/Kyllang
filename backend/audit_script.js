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
    
    // Part 1 - Model definitions & counts
    const models = {
        User: { collection: User.collection.name, count: await User.countDocuments() },
        Doctor: { collection: Doctor.collection.name, count: await Doctor.countDocuments() },
        Patient: { collection: Patient.collection.name, count: await Patient.countDocuments() },
        LabReport: { collection: LabReport.collection.name, count: await LabReport.countDocuments() },
        SecureFile: { collection: SecureFile.collection.name, count: await SecureFile.countDocuments() },
        FileVersion: { collection: FileVersion.collection.name, count: await FileVersion.countDocuments() },
        AuditLog: { collection: AuditLog.collection.name, count: await AuditLog.countDocuments() }
    };
    
    // Part 2 - Verify MRI Report
    const mriId = '6ab6c5bf1d831242a5b0e859';
    const report = await LabReport.findById(mriId).lean();
    
    // Part 3 - Resolve Patient ID
    const patientId = '6a9c38027543c3aa0742bee5';
    const patientUser = await User.findById(patientId).select('-password').lean();
    const patientProfile = await Patient.findOne({ user: patientId }).lean();
    
    // Part 4 - Resolve Doctor IDs
    const docId1 = '6a9c2ec0b8faba626c6f8bb0'; // LabReport doctor
    const docId2 = '6a9c2ec0b8faba626c6f8baf'; // SecureFile uploader
    
    const docUser1 = await User.findById(docId1).select('-password').lean();
    const docProfile1 = await Doctor.findById(docId1).lean();
    const docProfileByUserId1 = await Doctor.findOne({ user: docId1 }).lean();
    
    const docUser2 = await User.findById(docId2).select('-password').lean();
    const docProfile2 = await Doctor.findById(docId2).lean();
    const docProfileByUserId2 = await Doctor.findOne({ user: docId2 }).lean();
    
    // Part 5 - Bidirectional
    const secureFileId = '6ab6c5bf1d831242a5b0e85a';
    const sf = await SecureFile.findById(secureFileId).lean();
    const fv = await FileVersion.findOne({ secureFile: secureFileId }).lean();
    
    // Part 6 - Compare Ownership
    const cbcId = '6ab57981e9576acf5aec6092';
    const ecgId = '6ab6156fe149839c77668403';
    const cbc = await LabReport.findById(cbcId).lean();
    const ecg = await LabReport.findById(ecgId).lean();
    
    // Part 8 - Audit & Blockchain
    const auditLogs = await AuditLog.find({ 
        $or: [
            { targetId: mriId },
            { targetId: secureFileId }
        ]
    }).sort({ createdAt: -1 }).lean();
    
    // Part 9 - Duplicates
    const reportsForMRI = await LabReport.countDocuments({ patient: patientId, testName: 'MRI Brain', creationMode: 'upload' });
    const secureFilesForMRI = await SecureFile.countDocuments({ linkedLabReport: mriId });
    const fileVersionsForSF = await FileVersion.countDocuments({ secureFile: secureFileId });
    
    console.log(JSON.stringify({
        models,
        mriReport: report,
        patientInfo: {
            user: patientUser,
            profile: patientProfile
        },
        doctorInfo: {
            id1: { user: docUser1, profileById: docProfile1, profileByUserId: docProfileByUserId1 },
            id2: { user: docUser2, profileById: docProfile2, profileByUserId: docProfileByUserId2 }
        },
        secureFileInfo: { secureFile: sf, fileVersion: fv },
        compare: { cbc, ecg },
        auditLogs,
        duplicates: { reportsForMRI, secureFilesForMRI, fileVersionsForSF }
    }, null, 2));
    
    process.exit(0);
}
run().catch(console.error);
