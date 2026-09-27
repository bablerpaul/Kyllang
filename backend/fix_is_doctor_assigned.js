const fs = require('fs');

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace isDoctorAssigned function body
    const oldFunc = /async function isDoctorAssigned\(reqUser, patientId\) \{[\s\S]*?\n\}/;
    const newFunc = `async function isDoctorAssigned(reqUser, patientId) {
    if (reqUser.role !== 'doctor') return false;
    const Doctor = require('../../../models/Doctor');
    const doctorProfile = await Doctor.findOne({ user: reqUser._id }).lean();
    const pidString = (patientId && patientId._id) ? patientId._id.toString() : (patientId ? patientId.toString() : '');
    return doctorProfile && doctorProfile.assignedPatients && doctorProfile.assignedPatients.some(id => id.toString() === pidString);
}`;

    if (content.match(oldFunc)) {
        content = content.replace(oldFunc, newFunc);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Patched", filePath);
    } else {
        console.log("Regex did not match in", filePath);
    }
}

patchFile('c:/main project/project/backend/src/modules/emr/emrRecordController.js');
patchFile('c:/main project/project/backend/src/modules/emr/emrController.js');
