const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Deterministically sorts keys of an object and its nested objects/arrays.
 * Conforms to stable JSON canonicalization principles (similar to RFC 8785).
 */
function sortAndFilter(obj) {
    if (obj === null) return null;
    if (obj === undefined) return undefined; // Will be stripped from objects by JSON.stringify
    
    if (obj instanceof Date) {
        return obj.toISOString();
    }
    
    // Handle Mongoose ObjectIds
    if (typeof obj === 'object' && obj.constructor && obj.constructor.name === 'ObjectId') {
        return obj.toString();
    }
    // Also handle raw strings that are object ids if they come from `.lean()` or populated objects,
    // but those are just primitive strings, so handled below.
    
    if (Array.isArray(obj)) {
        // We preserve array order for EMR arrays (medications, attachments, etc.)
        // But we must canonicalize their contents.
        // Convert undefined elements to null as per standard JSON behavior
        return obj.map(item => {
            const val = sortAndFilter(item);
            return val === undefined ? null : val;
        });
    }

    if (typeof obj === 'object') {
        const sortedKeys = Object.keys(obj).sort();
        const result = {};
        for (const key of sortedKeys) {
            const val = sortAndFilter(obj[key]);
            if (val !== undefined) {
                result[key] = val;
            }
        }
        return result;
    }

    // primitives (string, number, boolean)
    return obj;
}

/**
 * Returns a canonical deterministic JSON string for the payload.
 */
function canonicalize(payload) {
    return JSON.stringify(sortAndFilter(payload));
}

/**
 * Generates an integrity hash for an EMR version.
 * 
 * @param {Object} emrData The clinical state payload to protect
 * @param {Number} version The integrity version number
 * @param {String|null} previousHash The previous version's integrity hash
 * @returns {String} The SHA-256 hex digest
 */
function generateIntegrityHash(emrData, version, previousHash) {
    const payload = {
        data: emrData,
        version: version,
        previousHash: previousHash || null
    };
    const canonicalStr = canonicalize(payload);
    return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

/**
 * Extracts ONLY the fields that should be part of the EMR integrity state.
 * @param {Object} doc Mongoose document or plain object
 */
function buildIntegrityPayload(doc) {
    // We only take the plaintext logical clinical record state.
    // Exclude: encryption keys, MongoDB _id, __v, patientSalt, and system metadata.
    // Attachments order is preserved and meaningful.
    const attachments = doc.attachments ? doc.attachments.map(att => ({
        title: att.title,
        fileUrl: att.fileUrl,
        ipfsCid: att.ipfsCid,
        fileHash: att.fileHash,
        // Omit generated _id inside arrays
    })) : [];

    return {
        patient: doc.patient ? doc.patient.toString() : null,
        doctor: doc.doctor ? doc.doctor.toString() : null,
        diagnosis: doc.diagnosis,
        symptoms: doc.symptoms || [],
        allergies: doc.allergies || [],
        medications: doc.medications || [],
        vitals: doc.vitals || null,
        vitalSigns: doc.vitalSigns || null,
        clinicalNotes: doc.clinicalNotes || '',
        chiefComplaint: doc.chiefComplaint || doc.diagnosis || '',
        treatmentPlan: doc.treatmentPlan || '',
        visitDate: doc.visitDate ? new Date(doc.visitDate).toISOString() : null,
        attachments: attachments
    };
}

/**
 * Generates a deterministic record commitment for a given EMR ID using HMAC-SHA256.
 * The server secret is NOT exposed on-chain.
 * @param {String} recordId The MongoDB ObjectId or unique identifier of the EMR
 * @returns {String} The 64-character hex string representing the 32-byte commitment.
 */
function generateRecordCommitment(recordId) {
    if (!recordId) throw new Error("recordId is required for commitment");
    const secret = process.env.MASTER_ENCRYPTION_KEY;
    if (!secret) throw new Error("MASTER_ENCRYPTION_KEY is required to generate record commitments");
    return crypto.createHmac('sha256', secret).update(recordId.toString()).digest('hex');
}

module.exports = {
    sortAndFilter,
    canonicalize,
    generateIntegrityHash,
    buildIntegrityPayload,
    generateRecordCommitment
};
