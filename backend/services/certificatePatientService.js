'use strict';
/**
 * certificatePatientService.js — patient identity helpers for Certificate.patient
 *
 * Canonical relationship: `Certificate.patient` is the Patient-profile `_id`.
 * (The Poseidon commitment of every issued certificate is computed from that ID, so it is fixed.)
 *
 * Legacy records may hold a User `_id` instead, so READERS accept both identities.
 * WRITERS must store only the Patient-profile `_id` (resolvePatientProfile) and must never create a profile.
 */

const Patient = require('../models/Patient');
const User = require('../models/User');

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const isObjectIdString = (value) => value !== null && value !== undefined && OBJECT_ID_RE.test(String(value));

/**
 * Resolve a Patient profile from a Patient-profile `_id` OR a User `_id`.
 * Read-only: never creates a profile. Returns { _id, user } or null.
 */
async function resolvePatientProfile(idInput) {
    if (!isObjectIdString(idInput)) return null;
    return Patient.findOne({ $or: [{ _id: idInput }, { user: idInput }] }).select('_id user').lean();
}

/**
 * All ids under which certificates may be stored for a patient:
 * the canonical Patient-profile `_id` first, then the User `_id` (legacy records).
 * Accepts either identity. If no profile exists, falls back to the supplied id alone.
 */
async function patientCertificateIds(idInput) {
    if (!isObjectIdString(idInput)) return [];
    const profile = await resolvePatientProfile(idInput);
    if (!profile) return [idInput];
    return [profile._id, profile.user].filter(Boolean);
}

/**
 * Describe the patient behind each stored Certificate.patient value, without mutating anything.
 * Returns a Map keyed by String(storedId) -> { _id, patientId, userId, name, email } or null when the
 * id matches neither a Patient profile nor a User (orphan / dangling) — orphans are never re-attached.
 * `name` / `email` are null when the profile's User no longer exists.
 */
async function describeCertificatePatients(storedIds) {
    const ids = [...new Set((storedIds || []).filter(isObjectIdString).map(String))];
    const result = new Map(ids.map((id) => [id, null]));
    if (ids.length === 0) return result;

    const profiles = await Patient.find({ _id: { $in: ids } }).select('_id user').lean();
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const legacyUserIds = ids.filter((id) => !profileById.has(id));
    const userIds = [...profiles.map((p) => p.user), ...legacyUserIds].filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('name email').lean() : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    for (const id of ids) {
        const profile = profileById.get(id);
        if (profile) {
            const user = userById.get(String(profile.user));
            result.set(id, {
                _id: profile._id,
                patientId: String(profile._id),
                userId: profile.user || null,
                name: user ? user.name : null,
                email: user ? user.email : null,
            });
            continue;
        }
        const legacyUser = userById.get(id); // legacy record that stored a User _id
        if (legacyUser) {
            result.set(id, { _id: legacyUser._id, patientId: null, userId: legacyUser._id, name: legacyUser.name, email: legacyUser.email });
        }
        // else: dangling — stays null
    }
    return result;
}

/**
 * Replace `patient` on plain (lean) certificate objects with a described patient object.
 * Unresolvable/orphan certificates get { _id: <stored value>, name: null, unresolved: true } so callers
 * never crash on null and never see the record attached to some other user.
 * `includeEmail: false` strips the email (for public/least-privilege responses).
 */
async function withCertificatePatients(certificates, { includeEmail = true } = {}) {
    const map = await describeCertificatePatients(certificates.map((c) => c.patient));
    return certificates.map((cert) => {
        const info = map.get(String(cert.patient));
        let patient;
        if (info) {
            patient = { _id: info._id, patientId: info.patientId, name: info.name };
            if (includeEmail) patient.email = info.email;
        } else {
            patient = { _id: cert.patient, patientId: null, name: null, unresolved: true };
        }
        return { ...cert, patient };
    });
}

module.exports = {
    isObjectIdString,
    resolvePatientProfile,
    patientCertificateIds,
    describeCertificatePatients,
    withCertificatePatients,
};
