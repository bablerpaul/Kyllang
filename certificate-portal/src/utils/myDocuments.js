/**
 * myDocuments.js — pure normalizers for the patient "My Documents" hub.
 *
 * Converts records from the existing patient-scoped endpoints into display summaries:
 *   GET /api/emr/prescriptions    → normalizePrescription
 *   GET /api/lab-reports          → normalizeLabReport
 *   GET /api/patient/certificates → normalizeCertificate
 *
 * Pure functions only: no network, no storage, no vault, no decryption, no input mutation. Every summary is built
 * from an explicit allow-list of SAFE metadata; clinical payloads (medications, lab results/details/summary, visit
 * diagnosis) and certificate secrets (encryptedCredential, accessList, credential contents) are never copied, so they
 * cannot reach the UI, search text or logs through this module.
 */

export const DOCUMENT_ROUTES = {
    prescription: '/dashboard/prescriptions',
    lab_report: '/dashboard/lab-reports',
    certificate: '/dashboard/my-certificates',
};

const PRESCRIPTION_STATUS = {
    active: { label: 'Active', color: 'success' },
    completed: { label: 'Completed', color: 'default' },
    cancelled: { label: 'Cancelled', color: 'error' },
};

const LAB_STATUS = {
    pending: { label: 'Pending', color: 'warning' },
    in_progress: { label: 'In progress', color: 'info' },
    completed: { label: 'Completed', color: 'success' },
};

const CERTIFICATE_STATUS = {
    revoked: { label: 'Revoked', color: 'error' },
    expired: { label: 'Expired', color: 'warning' },
    active: { label: 'Active', color: 'success' },
};

const BADGES = {
    manual: { code: 'manual', label: 'Manual' },
    upload: { code: 'upload', label: 'Uploaded' },
    legacy: { code: 'legacy', label: 'Legacy' },
    secure_file: { code: 'secure_file', label: 'Secure file' },
    encrypted: { code: 'encrypted', label: 'Encrypted' },
    imported: { code: 'imported', label: 'Imported' },
};

// ── helpers ──────────────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idOf = (v) => {
    if (v === null || v === undefined) return '';
    if (isObj(v)) return v._id !== undefined || v.id !== undefined ? String(v._id ?? v.id) : '';
    return String(v);
};
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isoDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);
const statusOf = (map, raw) => {
    const code = text(raw);
    if (code && map[code]) return { status: code, statusLabel: map[code].label, statusColor: map[code].color };
    // Unknown or missing values are shown as-is / unknown — never invented.
    return { status: code || 'unknown', statusLabel: code || 'Unknown', statusColor: 'default' };
};
const searchTextOf = (parts) => parts.filter(Boolean).map((p) => String(p).toLowerCase()).join(' ');
const badge = (code) => ({ ...BADGES[code] });

/**
 * Certificate status, mirroring the established rule used by MyCertificates / CertificateViewerDialog /
 * PatientDetail (revoked > expired > active; expiry derived from validUntil < now, never from a stored value).
 */
export const certificateStatus = (cert, now = new Date()) => {
    if (cert?.status === 'revoked') return 'revoked';
    if (cert?.validUntil && new Date(cert.validUntil) < now) return 'expired';
    return 'active';
};

// ── normalizers ──────────────────────────────────────────────────────────────

/** GET /api/emr/prescriptions record → summary. Medication CONTENTS are never copied (only the count). */
export const normalizePrescription = (record) => {
    if (!isObj(record)) return null;
    const documentId = idOf(record._id ?? record.id);
    if (!documentId) return null;

    const doctor = isObj(record.doctor) ? record.doctor : null;
    const doctorName = text(doctor?.name) || text(doctor?.user?.name) || 'Unknown doctor';
    const specialty = text(doctor?.specialty);
    const medicationCount = Array.isArray(record.medications) ? record.medications.length : 0;
    const date = isoDate(record.issuedDate) || isoDate(record.createdAt);
    const st = statusOf(PRESCRIPTION_STATUS, record.status);
    const subtitle = `${medicationCount} medication${medicationCount === 1 ? '' : 's'}`;

    return {
        key: `prescription:${documentId}`,
        documentType: 'prescription',
        documentId,
        title: 'Prescription',
        subtitle,
        date,
        dateLabel: dateLabel(date),
        doctorRole: 'Doctor',
        doctorName,
        ...st,
        badges: [],
        extraDetails: specialty ? [{ label: 'Specialty', value: specialty }] : [],
        medicationCount,
        requiresUnlock: false,
        sourceType: 'prescription',
        openRoute: DOCUMENT_ROUTES.prescription,
        searchText: searchTextOf(['prescription', doctorName, specialty, st.statusLabel, subtitle, dateLabel(date)]),
    };
};

/** GET /api/lab-reports record → summary. results / reportDetails / overallSummary / visit are never copied. */
export const normalizeLabReport = (record) => {
    if (!isObj(record)) return null;
    const documentId = idOf(record._id ?? record.id);
    if (!documentId) return null;

    const orderedBy = isObj(record.orderedBy) ? record.orderedBy : null;
    const doctorName = text(orderedBy?.user?.name) || text(orderedBy?.name) || 'Unknown doctor';
    const testName = text(record.testName);
    const testCategory = text(record.testCategory);
    const investigationCategory = text(record.investigationCategory);
    const date = isoDate(record.reportDate) || isoDate(record.createdAt);
    const st = statusOf(LAB_STATUS, record.status);

    // Creation mode uses the model's own enum ('manual' | 'upload'); a missing value marks a legacy record.
    const mode = text(record.creationMode);
    const badges = [];
    if (mode === 'manual') badges.push(badge('manual'));
    else if (mode === 'upload') badges.push(badge('upload'));
    else if (!mode) badges.push(badge('legacy'));
    // A linked SecureFile is only indicated (by reference presence) — never fetched or decrypted here.
    const secureFileId = idOf(record.secureFile);
    const hasSecureFile = /^[0-9a-fA-F]{24}$/.test(secureFileId);
    if (hasSecureFile) badges.push(badge('secure_file'));

    const subtitle = [investigationCategory, testCategory].filter(Boolean).join(' · ') || null;

    return {
        key: `lab_report:${documentId}`,
        documentType: 'lab_report',
        documentId,
        title: testName || 'Lab report',
        subtitle,
        date,
        dateLabel: dateLabel(date),
        doctorRole: 'Ordered by',
        doctorName,
        ...st,
        badges,
        extraDetails: [],
        testName,
        testCategory,
        investigationCategory,
        creationMode: mode,
        hasSecureFile,
        requiresUnlock: false,
        sourceType: mode === 'manual' || mode === 'upload' ? mode : 'legacy',
        openRoute: DOCUMENT_ROUTES.lab_report,
        searchText: searchTextOf(['lab report', testName, testCategory, investigationCategory, doctorName, st.statusLabel, dateLabel(date)]),
    };
};

/**
 * GET /api/patient/certificates record → summary. Never returns encryptedCredential, accessList, credential
 * contents or remarks; "Encrypted" reflects only the PRESENCE of a credential, "Imported" only membership of the
 * certificate id in the caller-supplied non-sensitive id collection (never "Verified").
 */
export const normalizeCertificate = (record, importedCertificateIds = [], { now = new Date() } = {}) => {
    if (!isObj(record)) return null;
    const documentId = idOf(record._id ?? record.id);
    if (!documentId) return null;

    const issuer = isObj(record.issuedBy) ? record.issuedBy : null;
    const doctorName = text(issuer?.name) || 'Unknown issuer';
    const validFrom = isoDate(record.validFrom);
    const validUntil = isoDate(record.validUntil);
    const issued = isoDate(record.createdAt);
    const code = certificateStatus(record, now);
    const imported = new Set(Array.from(importedCertificateIds || [], (v) => String(v)));
    const validity = validFrom || validUntil ? `${dateLabel(validFrom) || '—'} – ${dateLabel(validUntil) || '—'}` : null;

    const badges = [];
    if (typeof record.encryptedCredential === 'string' && record.encryptedCredential.length > 0) badges.push(badge('encrypted'));
    if (imported.has(documentId)) badges.push(badge('imported'));

    return {
        key: `certificate:${documentId}`,
        documentType: 'certificate',
        documentId,
        reference: documentId, // the existing certificate UIs show the full certificate id
        title: 'Medical Certificate',
        subtitle: validity ? `Valid ${validity}` : null,
        date: issued || validFrom,
        dateLabel: dateLabel(issued || validFrom),
        doctorRole: 'Issued by',
        doctorName,
        status: code,
        statusLabel: CERTIFICATE_STATUS[code].label,
        statusColor: CERTIFICATE_STATUS[code].color,
        badges,
        extraDetails: validity ? [{ label: 'Validity', value: validity }] : [],
        validFrom,
        validUntil,
        requiresUnlock: true,
        sourceType: 'certificate',
        openRoute: DOCUMENT_ROUTES.certificate,
        searchText: searchTextOf(['medical certificate', 'certificate', documentId, doctorName, CERTIFICATE_STATUS[code].label, dateLabel(validFrom), dateLabel(validUntil), dateLabel(issued)]),
    };
};

/** All sources → one flat array (one summary per distinct source record; malformed records are skipped). */
export const normalizeDocuments = ({ prescriptions = [], labReports = [], certificates = [], importedCertificateIds = [], now = new Date() } = {}) => {
    const out = [];
    const seen = new Set();
    const add = (s) => { if (s && !seen.has(s.key)) { seen.add(s.key); out.push(s); } };
    (Array.isArray(prescriptions) ? prescriptions : []).forEach((r) => add(normalizePrescription(r)));
    (Array.isArray(labReports) ? labReports : []).forEach((r) => add(normalizeLabReport(r)));
    (Array.isArray(certificates) ? certificates : []).forEach((r) => add(normalizeCertificate(r, importedCertificateIds, { now })));
    return out;
};
