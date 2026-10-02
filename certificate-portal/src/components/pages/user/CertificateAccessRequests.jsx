import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, CardActions, Typography, Button, Chip, Alert, Avatar,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  CircularProgress, Divider, Grid, TextField, Stack
} from '@mui/material';
import {
  LockOpenOutlined, VerifiedUserOutlined, CheckCircle, Block, Refresh, AccessTime
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import { decryptKeyWithX25519, encryptKeyWithX25519 } from '../../../utils/cryptoUtils';
import { commitmentToBytes32, computeCommitment } from '../../../utils/poseidonUtils';
import { retrievePatientPrivateKey } from '../../../utils/patientKeyVault';

// Requests from doctors to VIEW an EXISTING certificate (CertificateAccessRequest).
// Not to be confused with MedicalCertificateRequests.jsx, which handles requests to CREATE a new certificate.
//
// Approval is client-side: the patient's browser decrypts the certificate's encryptedCredential with the vault key,
// verifies it, and re-encrypts it for the requesting doctor. Only that doctor-specific ciphertext is sent to the backend;
// the passphrase, private key and plaintext credential never leave this browser.

const REJECTION_REASON_MAX = 1000;

// Fields the Poseidon commitment is computed from (see IssueCertificateForm / MyCertificates).
const CREDENTIAL_FIELDS = ['patientId', 'diagnosisCode', 'validFrom', 'secretSalt'];

// Safe, user-facing messages for failed client-side approval checks. None reveal key material or which secret failed.
const APPROVE_MSG = {
  doctorKeyMissing: "Cannot approve this request because the doctor's encryption key is unavailable.",
  doctorKeyInvalid: "Cannot approve this request because the doctor's encryption key is invalid. Nothing was shared.",
  passphraseRequired: 'Enter your vault passphrase to continue.',
  certificatesUnavailable: 'Your certificates could not be loaded. Nothing was shared. Please try again.',
  certificateNotFound: 'The requested certificate was not found among your certificates. Nothing was shared.',
  certificateMismatch: 'Security check failed: the certificate does not match this request. Nothing was decrypted or shared.',
  noCredential: 'This certificate has no credential that can be shared.',
  unlockFailed: 'The certificate credential could not be unlocked with your vault. Nothing was shared.',
  unreadable: 'The certificate credential could not be read. Nothing was shared.',
  commitmentMismatch: 'Integrity check failed: the certificate credential does not match its registered commitment. Nothing was shared.',
  patientMismatch: 'Security check failed: this credential does not belong to your certificate. Nothing was shared.',
};

// A failed client-side check whose message is already safe to show.
class ApprovalCheckError extends Error {}

const idOf = (value) => (value && typeof value === 'object' ? value._id : value);
const sameId = (a, b) => idOf(a) != null && idOf(b) != null && String(idOf(a)) === String(idOf(b));
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const doctorPublicKeyOf = (request) => {
  const key = request?.doctor?.user?.publicKey;
  return typeof key === 'string' && key.trim() !== '' ? key : null;
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const CERT_STATUS_COLOR = { active: 'success', expired: 'warning', revoked: 'error' };

// Map backend status codes to safe, user-facing messages. Server messages are never shown verbatim.
const describeError = (err, action) => {
  switch (err?.status) {
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return action === 'load'
        ? 'Your patient profile could not be found.'
        : 'This request was not found or is no longer available.';
    case 409:
      return 'This request is no longer pending. It may already have been approved or rejected.';
    case 400:
      if (action === 'reject') return 'The request or rejection reason was invalid.';
      if (action === 'approve') return 'The approval data was rejected as invalid. Nothing was shared.';
      return 'The request was invalid.';
    default:
      if (action === 'load') return 'Failed to load certificate access requests. Please try again.';
      if (action === 'approve') return 'Failed to approve the request. Please try again.';
      return 'Failed to reject the request. Please try again.';
  }
};

const DetailRow = ({ label, children }) => (
  <Box sx={{ mb: 0.75 }}>
    <Typography variant="caption" color="text.secondary" component="div">
      {label}
    </Typography>
    <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>
      {children}
    </Typography>
  </Box>
);

const CertificateAccessRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Approval dialog: 'confirm' → 'passphrase'. The passphrase is held only while typed and cleared on submit.
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveStep, setApproveStep] = useState('confirm');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');

  const fetchRequests = useCallback(async ({ initial = false } = {}) => {
    try {
      initial ? setLoading(true) : setRefreshing(true);
      // Backend defaults to status=pending and scopes to the authenticated patient.
      const res = await apiFetch('/api/patient/certificate-access-requests');
      setRequests(res?.success && Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      console.error('Failed to load certificate access requests:', err?.status);
      setError(describeError(err, 'load'));
    } finally {
      initial ? setLoading(false) : setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests({ initial: true });
  }, [fetchRequests]);

  const openRejectDialog = (request) => {
    setRejectTarget(request);
    setRejectionReason('');
    setRejectError('');
  };

  const closeRejectDialog = () => {
    if (rejecting) return;
    setRejectTarget(null);
    setRejectionReason('');
    setRejectError('');
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget?._id) return;
    const reason = rejectionReason.trim();
    if (reason.length > REJECTION_REASON_MAX) {
      setRejectError(`Reason must be ${REJECTION_REASON_MAX} characters or fewer.`);
      return;
    }

    try {
      setRejecting(true);
      setRejectError('');
      await apiFetch(`/api/patient/certificate-access-requests/${encodeURIComponent(rejectTarget._id)}/reject`, {
        method: 'POST',
        body: JSON.stringify(reason ? { rejectionReason: reason } : {}),
      });
      const doctorName = rejectTarget.doctor?.user?.name;
      setRejectTarget(null);
      setRejectionReason('');
      setSuccess(`Access request${doctorName ? ` from Dr. ${doctorName}` : ''} rejected.`);
      await fetchRequests();
    } catch (err) {
      console.error('Failed to reject certificate access request:', err?.status);
      if (err?.status === 404 || err?.status === 409) {
        // The request is gone or already decided — close the dialog and resync with the backend.
        // Set the message after the refetch, which clears `error` on success.
        setRejectTarget(null);
        setRejectionReason('');
        await fetchRequests();
        setError(describeError(err, 'reject'));
      } else {
        setRejectError(describeError(err, 'reject'));
      }
    } finally {
      setRejecting(false);
    }
  };

  const openApproveDialog = (request) => {
    setApproveTarget(request);
    setApproveStep('confirm');
    setPassphraseInput('');
    setApproveError(doctorPublicKeyOf(request) ? '' : APPROVE_MSG.doctorKeyMissing);
  };

  const closeApproveDialog = () => {
    if (approving) return;
    setApproveTarget(null);
    setApproveStep('confirm');
    setPassphraseInput('');
    setApproveError('');
  };

  const handleConfirmApprove = async () => {
    const request = approveTarget;
    if (!request?._id || approving) return;

    // From here on the passphrase exists only in this call; clear the input state immediately.
    let passphrase = passphraseInput;
    setPassphraseInput('');
    if (!passphrase) {
      setApproveError(APPROVE_MSG.passphraseRequired);
      return;
    }

    let privateKey = null;
    let plaintext = null;
    let credential = null;
    let doctorEncryptedCredential = null;

    setApproving(true);
    setApproveError('');
    try {
      // The recipient comes only from the trusted CertificateAccessRequest record.
      const doctorPublicKey = doctorPublicKeyOf(request);
      if (!doctorPublicKey) throw new ApprovalCheckError(APPROVE_MSG.doctorKeyMissing);

      // 1. Load the exact certificate from the patient-scoped endpoint (ownership enforced by the session).
      let certificates;
      try {
        const res = await apiFetch('/api/patient/certificates');
        certificates = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load certificates for approval:', err?.status);
        throw new ApprovalCheckError(APPROVE_MSG.certificatesUnavailable);
      }
      const requestedId = idOf(request.certificate);
      const certificate = requestedId ? certificates.find((c) => sameId(c?._id, requestedId)) : null;
      if (!certificate) throw new ApprovalCheckError(APPROVE_MSG.certificateNotFound);

      // 2. The request must describe exactly this certificate — checked before anything is decrypted.
      if (!sameId(certificate._id, requestedId)
          || !sameHash(certificate.publicCommitmentHash, request.certificate?.publicCommitmentHash)) {
        throw new ApprovalCheckError(APPROVE_MSG.certificateMismatch);
      }
      if (typeof certificate.encryptedCredential !== 'string' || !certificate.encryptedCredential) {
        throw new ApprovalCheckError(APPROVE_MSG.noCredential);
      }

      // 3. Unlock the vault key and decrypt. Every failure here gets one message, so it never reveals which input was wrong.
      try {
        privateKey = await retrievePatientPrivateKey(passphrase);
        passphrase = null;
        plaintext = decryptKeyWithX25519(certificate.encryptedCredential, privateKey);
      } catch (_) {
        throw new ApprovalCheckError(APPROVE_MSG.unlockFailed);
      } finally {
        passphrase = null;
        privateKey = null;
      }

      // 4. Parse and check the fields the commitment is built from.
      try {
        credential = JSON.parse(plaintext);
      } catch (_) {
        throw new ApprovalCheckError(APPROVE_MSG.unreadable);
      }
      if (!credential || typeof credential !== 'object'
          || CREDENTIAL_FIELDS.some((field) => credential[field] === undefined || credential[field] === null || credential[field] === '')) {
        throw new ApprovalCheckError(APPROVE_MSG.unreadable);
      }

      // 5. Recompute the Poseidon commitment exactly as MyCertificates does and compare with the certificate.
      let recomputed;
      try {
        recomputed = commitmentToBytes32(await computeCommitment(
          credential.patientId,
          credential.diagnosisCode,
          credential.validFrom,
          credential.secretSalt,
        ));
      } catch (_) {
        throw new ApprovalCheckError(APPROVE_MSG.commitmentMismatch);
      }
      if (!sameHash(recomputed, certificate.publicCommitmentHash)) {
        throw new ApprovalCheckError(APPROVE_MSG.commitmentMismatch);
      }

      // 6. The credential must name the patient that owns this certificate (as returned for this session and as
      //    recorded on the request) — never trust the embedded patientId on its own.
      if (!sameId(credential.patientId, certificate.patient) || !sameId(certificate.patient, request.certificate?.patient)) {
        throw new ApprovalCheckError(APPROVE_MSG.patientMismatch);
      }
      credential = null;

      // 7. Re-encrypt the verified plaintext, byte for byte, for the requesting doctor.
      try {
        doctorEncryptedCredential = encryptKeyWithX25519(plaintext, doctorPublicKey);
      } catch (_) {
        throw new ApprovalCheckError(APPROVE_MSG.doctorKeyInvalid);
      } finally {
        plaintext = null;
      }

      // 8. Send only the doctor-specific ciphertext.
      try {
        await apiFetch(`/api/patient/certificate-access-requests/${encodeURIComponent(request._id)}/approve`, {
          method: 'POST',
          body: JSON.stringify({ doctorEncryptedCredential }),
        });
      } finally {
        doctorEncryptedCredential = null;
      }

      const doctorName = request.doctor?.user?.name;
      setApproveTarget(null);
      setApproveStep('confirm');
      setSuccess(`Access granted${doctorName ? ` to Dr. ${doctorName}` : ''} for certificate ${idOf(request.certificate)}.`);
      await fetchRequests();
    } catch (err) {
      if (err instanceof ApprovalCheckError) {
        console.error('Certificate access approval stopped by a client-side check.');
        setApproveError(err.message);
      } else {
        console.error('Failed to approve certificate access request:', err?.status);
        if (err?.status === 404 || err?.status === 409) {
          // Gone or already decided elsewhere — close, resync with the backend, and never resubmit.
          setApproveTarget(null);
          setApproveStep('confirm');
          await fetchRequests();
          setError(describeError(err, 'approve'));
        } else {
          setApproveError(describeError(err, 'approve'));
        }
      }
    } finally {
      passphrase = null;
      privateKey = null;
      plaintext = null;
      credential = null;
      doctorEncryptedCredential = null;
      setApproving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 1 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Certificate Access Requests
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Doctors requesting permission to view certificates you already hold.
            Requests to issue a new certificate are listed under Med Cert Requests.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
          onClick={() => fetchRequests()}
          disabled={refreshing}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <AccessTime /> Pending Access Requests
        </Typography>
        <Chip label={`${requests.length} pending`} color="warning" variant="outlined" />
      </Box>

      {requests.length === 0 ? (
        <Alert severity="info">No pending certificate access requests.</Alert>
      ) : (
        <Stack spacing={2}>
          {requests.map((request) => {
            const doctor = request.doctor || {};
            const doctorUser = doctor.user || {};
            const cert = request.certificate || {};
            const certStatus = cert.status || 'unknown';
            const doctorLabel = doctorUser.name ? `Dr. ${doctorUser.name}` : 'A doctor';

            return (
              <Card key={request._id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      <LockOpenOutlined />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="overline" color="primary" sx={{ lineHeight: 1.2, display: 'block' }}>
                        Certificate Access Request
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {doctorLabel} is requesting access to an existing certificate
                      </Typography>
                    </Box>
                    <Chip label="Pending" color="warning" size="small" />
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Requested on {formatDateTime(request.requestedAt || request.createdAt)}
                  </Typography>

                  <Divider sx={{ mb: 2 }} />

                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                        Requesting doctor
                      </Typography>
                      <DetailRow label="Name">{doctorUser.name ? `Dr. ${doctorUser.name}` : 'Unknown'}</DetailRow>
                      <DetailRow label="Email">{doctorUser.email || '—'}</DetailRow>
                      <DetailRow label="Specialty">{doctor.specialty || '—'}</DetailRow>
                      {doctor.department && <DetailRow label="Department">{doctor.department}</DetailRow>}
                    </Grid>

                    <Grid size={{ xs: 12, md: 7 }}>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'action.hover',
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <VerifiedUserOutlined fontSize="small" /> Certificate requested
                        </Typography>
                        <DetailRow label="Certificate ID">
                          <Box component="span" sx={{ fontFamily: 'monospace' }}>{cert._id || '—'}</Box>
                        </DetailRow>
                        <DetailRow label="Status">
                          <Chip
                            label={certStatus}
                            size="small"
                            color={CERT_STATUS_COLOR[certStatus] || 'default'}
                            variant="outlined"
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </DetailRow>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 6 }}>
                            <DetailRow label="Valid from">{formatDate(cert.validFrom)}</DetailRow>
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <DetailRow label="Valid until">{formatDate(cert.validUntil)}</DetailRow>
                          </Grid>
                        </Grid>
                        <DetailRow label="Issued on">{formatDate(cert.createdAt)}</DetailRow>
                        {cert.remarks && <DetailRow label="Remarks">{cert.remarks}</DetailRow>}
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>

                <CardActions sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1, px: 2, pb: 2 }}>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<Block />}
                    onClick={() => openRejectDialog(request)}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<CheckCircle />}
                    onClick={() => openApproveDialog(request)}
                  >
                    Approve
                  </Button>
                </CardActions>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Reject confirmation */}
      <Dialog open={Boolean(rejectTarget)} onClose={closeRejectDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Certificate Access Request</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {rejectTarget?.doctor?.user?.name ? `Dr. ${rejectTarget.doctor.user.name}` : 'The requesting doctor'} will
            not be given access to certificate{' '}
            <Box component="span" sx={{ fontFamily: 'monospace' }}>{rejectTarget?.certificate?._id || ''}</Box>.
            Your certificate itself is not changed.
          </DialogContentText>
          {rejectError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rejectError}
            </Alert>
          )}
          <TextField
            label="Reason (optional)"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            disabled={rejecting}
            helperText={`${rejectionReason.length}/${REJECTION_REASON_MAX}`}
            slotProps={{ htmlInput: { maxLength: REJECTION_REASON_MAX } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRejectDialog} disabled={rejecting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmReject}
            disabled={rejecting}
          >
            {rejecting ? 'Rejecting...' : 'Reject Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approve: confirmation, then the vault passphrase (same pattern as My Certificates' "Unlock Local Vault") */}
      <Dialog open={Boolean(approveTarget)} onClose={closeApproveDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {approveStep === 'confirm' ? 'Approve Certificate Access' : 'Unlock Local Vault'}
        </DialogTitle>
        <DialogContent dividers>
          {approveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {approveError}
            </Alert>
          )}
          {approveStep === 'confirm' ? (
            <>
              <DialogContentText sx={{ mb: 2 }}>
                You are granting{' '}
                <strong>{approveTarget?.doctor?.user?.name ? `Dr. ${approveTarget.doctor.user.name}` : 'the requesting doctor'}</strong>{' '}
                access to this existing certificate.
              </DialogContentText>
              <DetailRow label="Certificate ID">
                <Box component="span" sx={{ fontFamily: 'monospace' }}>{idOf(approveTarget?.certificate) || '—'}</Box>
              </DetailRow>
              <DetailRow label="Validity">
                {formatDate(approveTarget?.certificate?.validFrom)} to {formatDate(approveTarget?.certificate?.validUntil)}
              </DetailRow>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Next you will unlock your vault. Your browser decrypts this certificate&apos;s credential and re-encrypts it
                so that only this doctor can read it. Your passphrase and private key never leave this browser.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" gutterBottom>
                Enter your vault passphrase to securely decrypt your local private key.
              </Typography>
              <TextField
                autoFocus
                margin="dense"
                label="Vault Passphrase"
                type="password"
                fullWidth
                variant="outlined"
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                disabled={approving}
                slotProps={{ htmlInput: { autoComplete: 'off' } }}
              />
              {approving && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">Verifying and re-encrypting the credential…</Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeApproveDialog} disabled={approving}>
            Cancel
          </Button>
          {approveStep === 'confirm' ? (
            <Button
              variant="contained"
              color="success"
              onClick={() => { setApproveError(''); setApproveStep('passphrase'); }}
              disabled={!doctorPublicKeyOf(approveTarget)}
            >
              Continue
            </Button>
          ) : (
            <Button variant="contained" color="primary" onClick={handleConfirmApprove} disabled={approving}>
              {approving ? 'Approving...' : 'Unlock & Approve'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CertificateAccessRequests;
