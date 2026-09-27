const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Patient = require('./models/Patient');
const User = require('./models/User');
const SecureFile = require('./src/modules/secure-storage/models/SecureFile');
const FileVersion = require('./src/modules/secure-storage/models/FileVersion');
const MedicalRecord = require('./models/MedicalRecord');
const Certificate = require('./models/Certificate');
const InsuranceClaim = require('./models/InsuranceClaim');

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    try {
        const report = {
            secureFiles: 0,
            fileVersions: 0,
            healthy: 0,
            missingStorage: 0,
            danglingDbRef: 0,
            legacyUserRef: 0,
            unreferencedStorage: 0,
            multipleReferences: 0,
            otherInconsistency: 0,
            linkedEMRConsistency: { valid: 0, missing: 0, mismatch: 0, malformed: 0 },
            linkedCertificateConsistency: { valid: 0, missing: 0, mismatch: 0, malformed: 0 },
            linkedInsuranceConsistency: { valid: 0, missing: 0, mismatch: 0, malformed: 0 },
            patientConsistency: { validProfile: 0, legacyUser: 0, dangling: 0, uncertain: 0 },
            fallbackInventory: { total: 0, referenced: 0, unreferenced: 0, missingReferenced: 0 },
            tempInventory: { files: [] }
        };

        const secureFiles = await SecureFile.find().lean();
        const fileVersions = await FileVersion.find().lean();
        
        report.secureFiles = secureFiles.length;
        report.fileVersions = fileVersions.length;

        // Inventory Fallback Storage
        const fallbackDir = path.join(__dirname, 'uploads', 'fallback-storage');
        let physicalFiles = [];
        if (fs.existsSync(fallbackDir)) {
            physicalFiles = fs.readdirSync(fallbackDir);
            report.fallbackInventory.total = physicalFiles.length;
        }

        const cidReferences = {};
        for (const fv of fileVersions) {
            if (fv.ipfsCid) {
                cidReferences[fv.ipfsCid] = (cidReferences[fv.ipfsCid] || 0) + 1;
            }
        }

        report.fallbackInventory.referenced = Object.keys(cidReferences).filter(cid => physicalFiles.includes(cid)).length;
        report.fallbackInventory.unreferenced = physicalFiles.filter(f => !cidReferences[f]).length;
        report.fallbackInventory.missingReferenced = Object.keys(cidReferences).filter(cid => String(cid).startsWith('mock_') && !physicalFiles.includes(cid)).length;
        
        report.unreferencedStorage = report.fallbackInventory.unreferenced;
        
        for (const count of Object.values(cidReferences)) {
            if (count > 1) report.multipleReferences++;
        }

        const isObjectIdString = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

        for (const sf of secureFiles) {
            const fv = fileVersions.find(v => v.secureFile.toString() === sf._id.toString() && v.isCurrent);
            
            // Storage check
            let isStorageMissing = false;
            if (fv && String(fv.ipfsCid).startsWith('mock_')) {
                if (!physicalFiles.includes(fv.ipfsCid)) {
                    isStorageMissing = true;
                }
            } else if (!fv) {
                isStorageMissing = true; // No file version
            }
            
            if (isStorageMissing) report.missingStorage++;
            else report.healthy++;

            // Patient check
            let pStatus = 'dangling';
            const patStr = String(sf.patient);
            if (isObjectIdString(patStr)) {
                const pDoc = await Patient.findById(patStr).lean();
                if (pDoc) {
                    pStatus = 'validProfile';
                } else {
                    const uDoc = await User.findById(patStr).lean();
                    if (uDoc) {
                        pStatus = 'legacyUser';
                        const pForU = await Patient.findOne({ user: uDoc._id }).lean();
                        if (pForU) pStatus = 'legacyUser (resolvable)';
                    }
                }
            }
            
            if (pStatus === 'validProfile') report.patientConsistency.validProfile++;
            else if (pStatus.startsWith('legacyUser')) report.patientConsistency.legacyUser++;
            else report.patientConsistency.dangling++;

            if (pStatus === 'dangling') report.danglingDbRef++;
            if (pStatus.startsWith('legacyUser')) report.legacyUserRef++;

            // Linked Entity check
            const checkLink = async (linkId, model, counts) => {
                if (!linkId) return;
                if (!isObjectIdString(String(linkId))) {
                    counts.malformed++;
                    return;
                }
                const doc = await model.findById(linkId).lean();
                if (!doc) {
                    counts.missing++;
                    return;
                }
                
                // Simplified owner match check for this script
                let match = false;
                if (String(doc.patient) === patStr) match = true;
                else {
                    const docPat = await Patient.findById(doc.patient).lean();
                    if (docPat && String(docPat.user) === patStr) match = true;
                    // ... other direction
                }
                
                if (match) counts.valid++;
                else counts.mismatch++;
            };

            await checkLink(sf.linkedEMR, MedicalRecord, report.linkedEMRConsistency);
            await checkLink(sf.linkedCertificate, Certificate, report.linkedCertificateConsistency);
            await checkLink(sf.linkedInsurance, InsuranceClaim, report.linkedInsuranceConsistency);
        }

        // Temp files inventory
        const tempDir = path.join(__dirname, 'uploads', 'temp');
        if (fs.existsSync(tempDir)) {
            report.tempInventory.files = fs.readdirSync(tempDir);
        }

        console.log(JSON.stringify(report, null, 2));

        // Unreferenced files list
        const unref = physicalFiles.filter(f => !cidReferences[f]);
        console.log('Unreferenced Fallback Files:', unref);

        console.log('--- DONE ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
