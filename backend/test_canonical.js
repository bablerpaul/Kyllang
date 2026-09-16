const mongoose = require('mongoose');
const crypto = require('crypto');
const MedicalRecord = require('./models/MedicalRecord');

function canonicalizeEMRData(value) {
    if (value === null || value === undefined) {
        return value;
    }
    
    // Mongoose documents -> plain logical data
    if (typeof value.toObject === 'function') {
        value = value.toObject({ getters: true, virtuals: false, minimize: false });
    }

    if (value instanceof Date) {
        return value.toISOString();
    }
    
    // ObjectIds to strings
    if (value._bsontype === 'ObjectID' || value.constructor.name === 'ObjectId') {
        return value.toString();
    }
    
    if (Array.isArray(value)) {
        return value.map(item => canonicalizeEMRData(item)); // preserve array ordering
    }
    
    if (typeof value === 'object') {
        const sortedObj = {};
        
        Object.keys(value).sort().forEach(key => {
            // Remove Mongoose-generated fields
            if (key === '_id' || key === 'id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
                return;
            }
            if (key === 'blockchainHash' || key === 'transactionHash' || key === 'dataHash' || key === 'recordHash') {
                return;
            }
            // Strip out empty default vitals added by mongoose if we want to match raw body?
            // Actually let's just serialize what is there.
            sortedObj[key] = canonicalizeEMRData(value[key]);
        });
        return sortedObj;
    }
    
    return value;
}

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    const emr = await MedicalRecord.findOne({ dataHash: { $exists: true, $ne: null } });
    if (!emr) { console.log('No EMR found'); return process.exit(0); }
    
    const recordData = {
        patient: emr.patient.toString(),
        doctor: emr.doctor.toString(),
        diagnosis: emr.diagnosis,
        symptoms: emr.symptoms || [],
        vitalSigns: emr.vitalSigns || emr.vitals || { bloodPressure: '120/80', heartRate: 72, temperature: 98.6 },
        allergies: emr.allergies || [],
        medications: emr.medications || [],
        clinicalNotes: emr.clinicalNotes || '',
        chiefComplaint: emr.chiefComplaint || emr.diagnosis,
        treatmentPlan: emr.treatmentPlan || '',
        visitDate: emr.visitDate ? new Date(emr.visitDate).toISOString() : new Date().toISOString(),
    };
    
    const sortedRecordData = canonicalizeEMRData(recordData);
    const recordJSON = JSON.stringify(sortedRecordData);
    const dataHash = crypto.createHash('sha256').update(recordJSON).digest('hex');
    
    console.log('RECALCULATED (new):', dataHash);
    console.log('STORED (orig):', emr.dataHash);
    
    // Also try without recursively sorting nested objects (just top-level sort)
    const topLevelSorted = {};
    Object.keys(recordData).sort().forEach(k => {
        // Just strip _id from arrays for simulation
        let val = recordData[k];
        if (Array.isArray(val)) {
            val = val.map(v => {
                if (v && typeof v.toObject === 'function') v = v.toObject();
                if (v && v._id) delete v._id;
                if (v && v.id) delete v.id;
                return v;
            });
        } else if (val && typeof val.toObject === 'function') {
            val = val.toObject();
            delete val._id; delete val.id;
        }
        topLevelSorted[k] = val;
    });
    const topJSON = JSON.stringify(topLevelSorted);
    const topHash = crypto.createHash('sha256').update(topJSON).digest('hex');
    console.log('TOP-LEVEL SORT HASH:', topHash);
    
    process.exit(0);
});
