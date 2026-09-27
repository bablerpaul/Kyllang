import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@mui/material';
import { HowToRegOutlined, LocalHospital } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

// Consent is granted for a fixed, visible period (the backend default is also 30 days).
const CONSENT_DAYS = 30;

const asList = (res) => (Array.isArray(res) ? res : (res && res.data) || []);
const idOf = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const isActive = (c) => c.status === 'active' && (!c.expiresAt || new Date(c.expiresAt) > new Date());

/**
 * Patient-facing consent for the doctors ASSIGNED to the logged-in patient.
 * The doctor list comes from GET /api/patient/doctors (assignment is decided by the backend — there is no free-text doctor
 * entry), consents from GET /api/consent, and changes go through the existing consent endpoints. The backend stays authoritative.
 */
const DoctorConsent = () => {
  const [doctors, setDoctors] = useState([]);
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { severity, message }
  const [confirmRevoke, setConfirmRevoke] = useState(null); // { doctor, consent }

  const load = useCallback(async () => {
    try {
      const [doctorsRes, consentsRes] = await Promise.all([
        apiFetch('/api/patient/doctors'),
        apiFetch('/api/consent'),
      ]);
      setDoctors(asList(doctorsRes));
      setConsents(asList(consentsRes));
    } catch (error) {
      setFeedback({ severity: 'error', message: error.message || 'Failed to load consent information.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Consents to a given doctor (User id); the API returns newest first.
  const consentsFor = (doctor) => consents.filter((c) => c.grantedToRole === 'doctor' && String(idOf(c.grantedTo)) === String(doctor._id));
  const activeConsentFor = (doctor) => consentsFor(doctor).find(isActive) || null;

  const handleGrant = async (doctor) => {
    setBusyId(doctor._id);
    setFeedback(null);
    try {
      await apiFetch('/api/consent/grant-doctor', {
        method: 'POST',
        body: JSON.stringify({ doctorUserId: doctor._id, durationDays: CONSENT_DAYS }),
      });
      setFeedback({ severity: 'success', message: `Consent granted to ${doctor.name} for ${CONSENT_DAYS} days.` });
      await load();
    } catch (error) {
      setFeedback({ severity: 'error', message: error.message || 'Could not grant consent.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async () => {
    const { doctor, consent } = confirmRevoke;
    setConfirmRevoke(null);
    setBusyId(doctor._id);
    setFeedback(null);
    try {
      await apiFetch(`/api/consent/${consent._id}/revoke`, { method: 'PUT' });
      setFeedback({ severity: 'success', message: `Consent for ${doctor.name} was revoked.` });
      await load();
    } catch (error) {
      setFeedback({ severity: 'error', message: error.message || 'Could not revoke consent.' });
    } finally {
      setBusyId(null);
    }
  };

  const statusChip = (doctor) => {
    const active = activeConsentFor(doctor);
    if (active) {
      const until = active.expiresAt ? ` until ${new Date(active.expiresAt).toLocaleDateString()}` : '';
      return <Chip size="small" color="success" label={`Consent active${until}`} data-testid={`consent-status-${doctor._id}`} />;
    }
    const latest = consentsFor(doctor)[0];
    if (latest) {
      return <Chip size="small" color="warning" label={latest.status === 'revoked' ? 'Consent revoked' : 'Consent expired'} data-testid={`consent-status-${doctor._id}`} />;
    }
    return <Chip size="small" variant="outlined" label="No consent" data-testid={`consent-status-${doctor._id}`} />;
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
        <HowToRegOutlined /> Doctor Consent
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        A doctor assigned to you needs your consent to view your record and to issue certificates to you.
        Consent lasts {CONSENT_DAYS} days and you can revoke it here.
      </Alert>

      {feedback && (
        <Alert severity={feedback.severity} sx={{ mb: 2 }} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {doctors.length === 0 ? (
        <Alert severity="warning">
          No doctors are assigned to you yet. A hospital administrator assigns doctors to patients.
        </Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {doctors.map((doctor) => {
            const active = activeConsentFor(doctor);
            const busy = busyId === doctor._id;
            return (
              <Card key={doctor._id} variant="outlined" data-testid={`consent-doctor-${doctor._id}`}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <LocalHospital color="primary" />
                  <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{doctor.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {doctor.specialty || 'Doctor'} · {doctor.email}
                    </Typography>
                  </Box>
                  {statusChip(doctor)}
                  {active ? (
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={busy}
                      onClick={() => setConfirmRevoke({ doctor, consent: active })}
                      data-testid={`consent-revoke-${doctor._id}`}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={() => handleGrant(doctor)}
                      data-testid={`consent-grant-${doctor._id}`}
                    >
                      {busy ? 'Working…' : 'Grant consent'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)}>
        <DialogTitle>Revoke consent?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmRevoke ? `Revoke your consent for ${confirmRevoke.doctor.name}?` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRevoke(null)}>Cancel</Button>
          <Button color="error" onClick={handleRevoke} data-testid="consent-revoke-confirm">Revoke</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DoctorConsent;
