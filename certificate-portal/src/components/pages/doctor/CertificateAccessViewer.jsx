import { useState } from 'react';
import PropTypes from 'prop-types';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Divider, TextField, Typography,
} from '@mui/material';
import { VerifiedUserOutlined } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import { retrieveDoctorPrivateKey } from '../../../utils/doctorKeyVault';
import { decryptKeyWithX25519 } from '../../../utils/cryptoUtils';
import { commitmentToBytes32, computeCommitment } from '../../../utils/poseidonUtils';

/**
 * CertificateAccessViewer — opens ONE existing certificate that a patient approved for this doctor
 * (CertificateAccessRequest). Entirely client-side:
 *   doctor vault passphrase → retrieveDoctorPrivateKey (vault + account + registered-key checks)
 *   → GET /api/doctor/certificate-access-requests/:requestId (approved + unexpired, this doctor only)
 *   → certificate-id check → decryptKeyWithX25519 → JSON → patient-id check → Poseidon commitment check
 *   → display of the verified fields only.
 * The passphrase, private key, ciphertext and raw plaintext never leave this function's locals and are never shown,
 * logged or stored; only the verified display fields are kept in state, and they are cleared on close.
 */

// Fields the issuance flow writes into every credential (IssueCertificateForm).
const REQUIRED_FIELDS = ['patientId', 'diagnosisCode', 'validFrom', 'validUntil', 'secretSalt', 'commitment'];

const MSG = {
    vault: 'Your doctor encryption key could not be unlocked.',
    passphraseRequired: 'Enter your encryption key passphrase.',
    expired: 'This certificate access has expired.',
    gone: 'This certificate access is no longer available.',
    conflict: 'This access request is no longer available.',
    session: 'Your session has expired. Please sign in again.',
    generic: 'The certificate could not be loaded. Please try again.',
    decrypt: 'The certificate could not be decrypted.',
    integrity: 'Certificate integrity verification failed.',
};

class ViewError extends Error {
    constructor(message, { accessGone = false } = {}) {
        super(message);
        this.accessGone = accessGone;
    }
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};
const fmtDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};
const accessIsActive = (request) => request?.status === 'approved' && request?.accessActive === true
    && Boolean(request?.expiresAt) && new Date(request.expiresAt) > new Date();
const CERT_STATUS_CHIP = { active: 'success', expired: 'warning', revoked: 'error' };

const Row = ({ label, children, mono = false }) => (
    <Box sx={{ mb: 1.25 }}>
        <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
        <Typography variant="body2" component="div" sx={{ wordBreak: 'break-all', ...(mono && { fontFamily: 'monospace' }) }}>{children}</Typography>
    </Box>
);
Row.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node, mono: PropTypes.bool };

const CertificateAccessViewer = ({ request, onClose, onAccessGone }) => {
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [verified, setVerified] = useState(null); // only the verified, displayable fields

    const close = () => {
        if (busy) return;
        setPassphrase('');
        setVerified(null);
        setError('');
        onClose();
    };

    const handleUnlock = async () => {
        let secret = passphrase;
        setPassphrase(''); // the passphrase lives only in this call from here on
        if (!secret) {
            setError(MSG.passphraseRequired);
            return;
        }
        // Approval is never permanent: re-check before touching the key or the backend.
        if (!accessIsActive(request)) {
            secret = null;
            setError(MSG.expired);
            return;
        }

        let privateKey = null;
        let plaintext = null;
        let credential = null;
        let ciphertext = null;
        setBusy(true);
        setError('');
        try {
            // 1. Unlock the doctor's own vault key (all identity/key checks live in retrieveDoctorPrivateKey).
            try {
                privateKey = await retrieveDoctorPrivateKey(secret);
            } catch (_) {
                throw new ViewError(MSG.vault);
            } finally {
                secret = null;
            }

            // 2. Fetch exactly this approved, unexpired access (the backend enforces doctor + approval + expiry).
            let access;
            try {
                const res = await apiFetch(`/api/doctor/certificate-access-requests/${encodeURIComponent(String(request.requestId))}`);
                access = res?.data;
            } catch (err) {
                console.error('Approved certificate access could not be loaded:', err?.status);
                if (err?.status === 404) throw new ViewError(MSG.gone, { accessGone: true });
                if (err?.status === 409) throw new ViewError(MSG.conflict, { accessGone: true });
                if (err?.status === 401) throw new ViewError(MSG.session);
                throw new ViewError(MSG.generic);
            }
            ciphertext = access?.doctorEncryptedCredential;
            const certificate = access?.certificate;

            // 3. It must be the same request and the same certificate the doctor chose — checked before decrypting.
            if (!access || typeof ciphertext !== 'string' || !ciphertext
                || !sameId(access.request?.requestId, request.requestId)
                || !sameId(certificate?.certificateId, request.certificate?.certificateId)
                || typeof certificate?.publicCommitmentHash !== 'string') {
                throw new ViewError(MSG.integrity);
            }

            // 4. Decrypt locally.
            try {
                plaintext = decryptKeyWithX25519(ciphertext, privateKey);
            } catch (_) {
                throw new ViewError(MSG.decrypt);
            } finally {
                privateKey = null;
                ciphertext = null;
            }

            // 5. Parse; never show the raw string.
            try {
                credential = JSON.parse(plaintext);
            } catch (_) {
                throw new ViewError(MSG.integrity);
            } finally {
                plaintext = null;
            }
            if (!credential || typeof credential !== 'object'
                || REQUIRED_FIELDS.some((f) => credential[f] === undefined || credential[f] === null || credential[f] === '')) {
                throw new ViewError(MSG.integrity);
            }

            // 6. The credential must name the patient the backend associates with this request.
            if (!sameId(credential.patientId, request.patient?.patientId)) throw new ViewError(MSG.integrity);

            // 7. Recompute the Poseidon commitment exactly as MyCertificates does and compare with the certificate.
            const expected = certificate.publicCommitmentHash.toLowerCase();
            let recomputed;
            let embedded;
            try {
                recomputed = commitmentToBytes32(await computeCommitment(
                    credential.patientId, credential.diagnosisCode, credential.validFrom, credential.secretSalt,
                )).toLowerCase();
                embedded = commitmentToBytes32(credential.commitment).toLowerCase();
            } catch (_) {
                throw new ViewError(MSG.integrity);
            }
            if (recomputed !== expected || embedded !== expected
                || (request.certificate?.publicCommitmentHash && request.certificate.publicCommitmentHash.toLowerCase() !== expected)) {
                throw new ViewError(MSG.integrity);
            }

            // 8. Keep only what the viewer shows (no salt, no commitment inputs, no ciphertext, no key).
            setVerified({
                certificateId: String(certificate.certificateId),
                patientName: request.patient?.name || null,
                diagnosis: String(credential.diagnosisCode),
                validFrom: certificate.validFrom,
                validUntil: certificate.validUntil,
                certificateStatus: certificate.status,
                revokedAt: certificate.revokedAt || null,
                remarks: certificate.remarks || null,
                issuerName: certificate.issuer?.name || null,
                issuerAddress: certificate.issuer?.address || null,
                blockchainTxHash: certificate.blockchainTxHash || null,
                publicCommitmentHash: certificate.publicCommitmentHash,
                accessExpiresAt: access.request?.expiresAt || request.expiresAt,
            });
        } catch (err) {
            if (!(err instanceof ViewError)) console.error('Certificate view failed.');
            setVerified(null);
            setError(err instanceof ViewError ? err.message : MSG.generic);
            if (err instanceof ViewError && err.accessGone && typeof onAccessGone === 'function') onAccessGone();
        } finally {
            secret = null;
            privateKey = null;
            plaintext = null;
            credential = null;
            ciphertext = null;
            setBusy(false);
        }
    };

    const patientLabel = request?.patient?.name ? `${request.patient.name}'s` : "the patient's";

    return (
        <Dialog open onClose={close} maxWidth="sm" fullWidth>
            <DialogTitle>{verified ? 'Verified Certificate' : 'View Certificate'}</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {!verified ? (
                    <>
                        <DialogContentText sx={{ mb: 2 }}>
                            You are opening {patientLabel} existing certificate{' '}
                            <Box component="span" sx={{ fontFamily: 'monospace' }}>{request?.certificate?.certificateId}</Box>{' '}
                            under the access the patient approved (until {fmtDateTime(request?.expiresAt)}).
                            Enter the passphrase of your encryption key — it is used only in this browser.
                        </DialogContentText>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Encryption key passphrase"
                            type="password"
                            fullWidth
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            disabled={busy}
                            slotProps={{ htmlInput: { autoComplete: 'off' } }}
                        />
                        {busy && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                                <CircularProgress size={18} />
                                <Typography variant="body2" color="text.secondary">Unlocking, decrypting and verifying…</Typography>
                            </Box>
                        )}
                    </>
                ) : (
                    <>
                        <Alert severity="success" icon={<VerifiedUserOutlined />} sx={{ mb: 2 }}>
                            Integrity verified: the decrypted credential matches the certificate&apos;s registered commitment.
                        </Alert>
                        {verified.certificateStatus && verified.certificateStatus !== 'active' && (
                            <Alert severity={verified.certificateStatus === 'revoked' ? 'error' : 'warning'} sx={{ mb: 2 }}>
                                This certificate is {verified.certificateStatus.toUpperCase()}
                                {verified.revokedAt ? ` (revoked ${fmtDate(verified.revokedAt)})` : ''} and is not currently valid.
                            </Alert>
                        )}
                        <Row label="Certificate ID" mono>{verified.certificateId}</Row>
                        {verified.patientName && <Row label="Patient">{verified.patientName}</Row>}
                        <Row label="Diagnosis">{verified.diagnosis}</Row>
                        <Row label="Validity">{fmtDate(verified.validFrom)} – {fmtDate(verified.validUntil)}</Row>
                        <Row label="Certificate status">
                            <Chip label={verified.certificateStatus || 'unknown'} size="small" variant="outlined"
                                color={CERT_STATUS_CHIP[verified.certificateStatus] || 'default'} sx={{ textTransform: 'capitalize' }} />
                        </Row>
                        {verified.remarks && <Row label="Remarks">{verified.remarks}</Row>}
                        <Row label="Issued by">{verified.issuerName || '—'}{verified.issuerAddress ? ` (${verified.issuerAddress})` : ''}</Row>
                        <Divider sx={{ my: 1.5 }} />
                        <Row label="Blockchain transaction" mono>{verified.blockchainTxHash || '—'}</Row>
                        <Row label="Registered commitment" mono>{verified.publicCommitmentHash}</Row>
                        <Row label="Your access expires">{fmtDateTime(verified.accessExpiresAt)}</Row>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={close} disabled={busy}>Close</Button>
                {!verified && (
                    <Button variant="contained" onClick={handleUnlock} disabled={busy}>
                        {busy ? 'Verifying...' : 'Unlock & View'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

CertificateAccessViewer.propTypes = {
    request: PropTypes.shape({
        requestId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        status: PropTypes.string,
        accessActive: PropTypes.bool,
        expiresAt: PropTypes.string,
        certificate: PropTypes.object,
        patient: PropTypes.object,
    }).isRequired,
    onClose: PropTypes.func.isRequired,
    onAccessGone: PropTypes.func,
};

export default CertificateAccessViewer;
