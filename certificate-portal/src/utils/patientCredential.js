/**
 * patientCredential.js — explicit validation of a patient's decrypted certificate credential.
 *
 * Used by My Certificates both when importing a credential (after decrypting Certificate.encryptedCredential)
 * and when reading it back from the encrypted local credential vault. A credential is trusted only if
 * every check passes; nothing here stores, logs or transmits the credential.
 *
 * The credential format is the one IssueCertificateForm encrypts:
 *   { patientId, diagnosisCode, validFrom, validUntil, secretSalt, commitment }
 * (validFrom / validUntil are Unix seconds; commitment is the decimal Poseidon commitment.)
 */
import { commitmentToBytes32, computeCommitment } from './poseidonUtils.js';

export const CREDENTIAL_REQUIRED_FIELDS = ['patientId', 'diagnosisCode', 'validFrom', 'validUntil', 'secretSalt', 'commitment'];

export const CREDENTIAL_ERROR_MESSAGES = {
    malformed: 'The certificate credential is not in the expected format.',
    missingField: 'The certificate credential is incomplete.',
    wrongPatient: 'This certificate credential does not belong to your account.',
    wrongCertificate: 'This certificate credential does not belong to this certificate.',
    commitmentMismatch: 'The certificate credential does not match the registered certificate commitment.',
};

export class CredentialValidationError extends Error {
    constructor(code) {
        super(CREDENTIAL_ERROR_MESSAGES[code] || CREDENTIAL_ERROR_MESSAGES.malformed);
        this.name = 'CredentialValidationError';
        this.code = code;
    }
}

const idOf = (v) => (v && typeof v === 'object' ? String(v._id ?? v.id ?? '') : String(v ?? ''));

const toBytes32 = (value) => {
    try {
        const s = String(value).trim();
        return (/^0x[0-9a-fA-F]{1,64}$/.test(s) ? '0x' + s.slice(2).toLowerCase().padStart(64, '0') : commitmentToBytes32(s)).toLowerCase();
    } catch (_) {
        return null;
    }
};

const toUnixSeconds = (date) => {
    const ms = Date.parse(date);
    return Number.isFinite(ms) ? ms / 1000 : NaN;
};

/**
 * Find the local-vault record id (the credential's own commitment) for a certificate, using only the
 * non-sensitive ids that listCredentials() returns.
 *
 * @param {string[]} vaultIds
 * @param {string} publicCommitmentHash - the certificate's registered commitment (bytes32 hex)
 * @returns {string|null}
 */
export function findVaultIdForCertificate(vaultIds, publicCommitmentHash) {
    const expected = toBytes32(publicCommitmentHash);
    if (!expected || !Array.isArray(vaultIds)) return null;
    return vaultIds.find((id) => toBytes32(id) === expected) ?? null;
}

/**
 * Validate a decrypted credential before it is stored or displayed. Throws CredentialValidationError on the
 * first failed check; returns the credential unchanged when every check passes.
 *
 * @param {object} credential           decrypted credential object
 * @param {object} context
 * @param {object} context.certificate  the server certificate record ({ _id, patient, publicCommitmentHash, validFrom, validUntil })
 * @param {string[]} context.patientIds the logged-in patient's identities (Patient-profile _id and User _id)
 */
export async function verifyCertificateCredential(credential, { certificate, patientIds }) {
    // 1. Structure
    if (!credential || typeof credential !== 'object' || Array.isArray(credential)) throw new CredentialValidationError('malformed');

    // 2. Required fields, each with the type the issuance flow produces
    if (CREDENTIAL_REQUIRED_FIELDS.some((f) => credential[f] === undefined || credential[f] === null || credential[f] === '')) {
        throw new CredentialValidationError('missingField');
    }
    const { patientId, diagnosisCode, validFrom, validUntil, secretSalt, commitment } = credential;
    if (typeof patientId !== 'string' || typeof diagnosisCode !== 'string' || !diagnosisCode.trim()
        || !Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validUntil < validFrom
        || typeof secretSalt !== 'string' || !/^(0x)?[0-9a-fA-F]+$/.test(secretSalt)
        || !(typeof commitment === 'string' || typeof commitment === 'number') || !toBytes32(commitment)) {
        throw new CredentialValidationError('malformed');
    }

    // 3. Explicit patient identity: the credential must name the logged-in patient …
    const sessionIds = (patientIds || []).map(idOf).filter(Boolean);
    if (sessionIds.length === 0 || !sessionIds.includes(patientId)) throw new CredentialValidationError('wrongPatient');
    // … and the patient this certificate record belongs to.
    if (!certificate || patientId !== idOf(certificate.patient)) throw new CredentialValidationError('wrongCertificate');

    // 4. Validity must be the certificate's registered validity.
    if (toUnixSeconds(certificate.validFrom) !== validFrom || toUnixSeconds(certificate.validUntil) !== validUntil) {
        throw new CredentialValidationError('wrongCertificate');
    }

    // 5. Recompute the Poseidon commitment; it must equal both the credential's own commitment and the registered one.
    const registered = toBytes32(certificate.publicCommitmentHash);
    let recomputed;
    try {
        recomputed = toBytes32(await computeCommitment(patientId, diagnosisCode, validFrom, secretSalt));
    } catch (_) {
        throw new CredentialValidationError('commitmentMismatch');
    }
    if (!registered || !recomputed || recomputed !== registered || toBytes32(commitment) !== registered) {
        throw new CredentialValidationError('commitmentMismatch');
    }
    return credential;
}
