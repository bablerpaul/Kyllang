const fs = require('fs');

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('async function isDoctorAssigned')) {
        const helper = `
async function isDoctorAssigned(reqUser, patientId) {
    if (reqUser.role !== 'doctor') return false;
    const Doctor = require('../../../models/Doctor');
    // Important: we only look for the doctor using reqUser._id.
    const doctorProfile = await Doctor.findOne({ user: reqUser._id }).lean();
    return doctorProfile && doctorProfile.assignedPatients && doctorProfile.assignedPatients.some(id => id.toString() === patientId.toString());
}
`;
        content = content.replace("const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');", 
            "const { hasActiveConsent, consentScopeFilter } = require('../../../middlewares/consentMiddleware');\n" + helper);
    }

    content = content.replace(/await hasActiveConsent\(\{\s*patientInput:\s*([^,]+),\s*requestingUser:\s*([^,]+),\s*requiredScope:\s*([^}]+)\s*\}\)/g, 
        "(await isDoctorAssigned($2, $1)) || await hasActiveConsent({ patientInput: $1, requestingUser: $2, requiredScope: $3 })");

    fs.writeFileSync(filePath, content, 'utf8');
}

patchFile('c:/main project/project/backend/src/modules/emr/emrRecordController.js');
patchFile('c:/main project/project/backend/src/modules/emr/emrController.js');
console.log("Patched successfully");
