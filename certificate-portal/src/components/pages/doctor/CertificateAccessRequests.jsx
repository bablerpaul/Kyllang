import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Card, CardContent, CardActions, Typography, Button, Chip, Alert, Stack, Divider,
  CircularProgress, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { Refresh, LockOpenOutlined, VisibilityOutlined } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import CertificateAccessViewer from './CertificateAccessViewer';

// Doctor's own requests to VIEW an EXISTING certificate (CertificateAccessRequest) — not requests to create a new
// certificate. The list is metadata only (GET /api/doctor/certificate-access-requests never returns ciphertext).
// An approved, unexpired request can be opened in CertificateAccessViewer, which unlocks the doctor's vault key and
// decrypts that single certificate in the browser.

const FILTERS = ['all', 'pending', 'approved', 'rejected'];
const STATUS_CHIP = { pending: 'warning', approved: 'success', rejected: 'error' };
const CERT_STATUS_CHIP = { active: 'success', expired: 'warning', revoked: 'error' };

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

const describeError = (err) => {
  switch (err?.status) {
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to view certificate access requests.';
    case 400: return 'The status filter was not accepted.';
    default: return 'Failed to load your certificate access requests. Please try again.';
  }
};

const Field = ({ label, children }) => (
  <Box sx={{ minWidth: 150 }}>
    <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
    <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>{children}</Typography>
  </Box>
);
Field.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};

const DoctorCertificateAccessRequests = () => {
  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null); // the approved request being opened

  const load = useCallback(async (status) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/doctor/certificate-access-requests?status=${encodeURIComponent(status)}`);
      setRequests(res?.success && Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      console.error('Failed to load certificate access requests:', err?.status);
      setRequests([]);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Certificate Access Requests</Typography>
          <Typography variant="body1" color="text.secondary">
            Your requests to view patients&apos; existing certificates. Create new certificates with Issue Certificate.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={loading ? <CircularProgress size={16} /> : <Refresh />} onClick={() => load(filter)} disabled={loading}>
          Refresh
        </Button>
      </Box>

      <ToggleButtonGroup
        value={filter}
        exclusive
        size="small"
        onChange={(_, value) => value && setFilter(value)}
        sx={{ mb: 3 }}
        aria-label="Filter by status"
      >
        {FILTERS.map((f) => (
          <ToggleButton key={f} value={f} sx={{ textTransform: 'capitalize' }}>{f}</ToggleButton>
        ))}
      </ToggleButtonGroup>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : !error && requests.length === 0 ? (
        <Alert severity="info">
          {filter === 'all' ? 'You have not requested access to any certificates yet.' : `No ${filter} certificate access requests.`}
        </Alert>
      ) : (
        <Stack spacing={2}>
          {requests.map((r) => {
            const cert = r.certificate || {};
            // Approval is never permanent: require the backend's accessActive AND a still-future expiresAt.
            const accessUsable = r.status === 'approved' && r.accessActive === true
              && Boolean(r.expiresAt) && new Date(r.expiresAt) > new Date();
            return (
              <Card key={r.requestId} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                    <LockOpenOutlined color="primary" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
                      {r.patient?.name || 'Patient'}
                    </Typography>
                    <Chip label={r.status} size="small" color={STATUS_CHIP[r.status] || 'default'} sx={{ textTransform: 'capitalize' }} />
                    {r.status === 'approved' && (
                      <Chip
                        label={accessUsable ? 'Access active' : 'Access expired'}
                        size="small"
                        variant="outlined"
                        color={accessUsable ? 'success' : 'default'}
                      />
                    )}
                  </Box>
                  <Divider sx={{ mb: 1.5 }} />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    <Field label="Certificate ID">
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>{cert.certificateId || '—'}</Box>
                    </Field>
                    <Field label="Certificate status">
                      <Chip
                        label={cert.status || 'unknown'}
                        size="small"
                        variant="outlined"
                        color={CERT_STATUS_CHIP[cert.status] || 'default'}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </Field>
                    <Field label="Certificate validity">{fmtDate(cert.validFrom)} – {fmtDate(cert.validUntil)}</Field>
                    <Field label="Requested">{fmtDateTime(r.requestedAt)}</Field>
                    {r.status === 'approved' && <Field label="Approved">{fmtDateTime(r.approvedAt)}</Field>}
                    {r.status === 'approved' && <Field label="Access expires">{fmtDateTime(r.expiresAt)}</Field>}
                    {r.status === 'rejected' && <Field label="Rejected">{fmtDateTime(r.rejectedAt)}</Field>}
                    {r.status === 'rejected' && r.rejectionReason && <Field label="Reason">{r.rejectionReason}</Field>}
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                  {r.status === 'approved' && accessUsable && (
                    <Button variant="contained" size="small" startIcon={<VisibilityOutlined />} onClick={() => setViewing(r)}>
                      View Certificate
                    </Button>
                  )}
                  {r.status === 'approved' && !accessUsable && <Chip label="Access Expired" size="small" />}
                  {r.status === 'pending' && <Chip label="Pending" color="warning" size="small" />}
                  {r.status === 'rejected' && <Chip label="Rejected" color="error" size="small" />}
                </CardActions>
              </Card>
            );
          })}
        </Stack>
      )}

      {viewing && (
        <CertificateAccessViewer
          key={String(viewing.requestId)}
          request={viewing}
          onClose={() => setViewing(null)}
          onAccessGone={() => load(filter)}
        />
      )}
    </Box>
  );
};

export default DoctorCertificateAccessRequests;
