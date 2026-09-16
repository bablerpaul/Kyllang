import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  TextField,
  Button,
  Grid,
  Alert,
  Divider,
  CircularProgress,
  Chip,
  Snackbar,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { apiFetch } from '../../../utils/api';

const DAYS = [
  { key: 'monday',    label: 'Mon', full: 'Monday' },
  { key: 'tuesday',   label: 'Tue', full: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
  { key: 'thursday',  label: 'Thu', full: 'Thursday' },
  { key: 'friday',    label: 'Fri', full: 'Friday' },
  { key: 'saturday',  label: 'Sat', full: 'Saturday' },
  { key: 'sunday',    label: 'Sun', full: 'Sunday' },
];

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];

const defaultDayState = () => ({ enabled: false, startTime: '09:00', endTime: '17:00' });

const buildDefaultAvailability = () =>
  Object.fromEntries(DAYS.map(d => [d.key, defaultDayState()]));

export default function DoctorAvailabilityManager() {
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [availability, setAvailability]   = useState(buildDefaultAvailability());
  const [duration, setDuration]           = useState(30);
  const [error, setError]                 = useState(null);
  const [successMsg, setSuccessMsg]       = useState('');

  // ── Load current availability ──────────────────────────────────────────
  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/doctor/me/availability');
      const data = res?.data;
      if (data?.availability) {
        // Merge fetched days over default (in case schema adds new days later)
        setAvailability(prev => ({
          ...prev,
          ...Object.fromEntries(
            DAYS.map(d => [
              d.key,
              data.availability[d.key] ?? defaultDayState(),
            ])
          ),
        }));
      }
      if (data?.appointmentDuration) {
        setDuration(data.appointmentDuration);
      }
    } catch (err) {
      setError('Failed to load availability settings. ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  // ── Handle changes ─────────────────────────────────────────────────────
  const toggleDay = (key) => {
    setAvailability(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const setDayTime = (key, field, value) => {
    setAvailability(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null);

    // Client-side validation
    for (const { key, full } of DAYS) {
      const d = availability[key];
      if (!d.enabled) continue;
      if (!d.startTime || !d.endTime) {
        setError(`${full}: please fill in both start and end times.`);
        return;
      }
      const [sh, sm] = d.startTime.split(':').map(Number);
      const [eh, em] = d.endTime.split(':').map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        setError(`${full}: end time must be after start time.`);
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch('/api/doctor/me/availability', {
        method: 'PUT',
        body: JSON.stringify({ availability, appointmentDuration: duration }),
      });
      setSuccessMsg('Availability saved successfully!');
    } catch (err) {
      setError('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading availability settings…</Typography>
      </Box>
    );
  }

  const enabledDays = DAYS.filter(d => availability[d.key]?.enabled);

  return (
    <Box id="doctor-availability-manager">
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventAvailableIcon color="primary" />
            Appointment Availability
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Configure which days and times patients can book appointments with you.
          </Typography>
        </Box>
        <Button
          id="save-availability-btn"
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          {saving ? 'Saving…' : 'Save Availability'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary chips */}
      {enabledDays.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {enabledDays.map(d => (
            <Chip
              key={d.key}
              label={`${d.label} ${availability[d.key].startTime}–${availability[d.key].endTime}`}
              size="small"
              color="primary"
              variant="outlined"
              icon={<AccessTimeIcon />}
            />
          ))}
        </Box>
      )}

      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: 0 }}>
          {DAYS.map(({ key, full }, idx) => {
            const day = availability[key];
            return (
              <React.Fragment key={key}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 3,
                    py: 1.75,
                    flexWrap: 'wrap',
                    transition: 'background 0.15s',
                    bgcolor: day.enabled ? 'rgba(37,99,235,0.03)' : 'transparent',
                  }}
                >
                  {/* Toggle */}
                  <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 130 }}>
                    <Switch
                      id={`avail-toggle-${key}`}
                      checked={day.enabled}
                      onChange={() => toggleDay(key)}
                      size="small"
                      color="primary"
                    />
                    <Typography
                      variant="body2"
                      sx={{ ml: 1, fontWeight: day.enabled ? 700 : 400, color: day.enabled ? '#0f172a' : '#94a3b8', minWidth: 90 }}
                    >
                      {full}
                    </Typography>
                  </Box>

                  {/* Times */}
                  {day.enabled ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <TextField
                        id={`avail-start-${key}`}
                        type="time"
                        size="small"
                        label="Start"
                        value={day.startTime}
                        onChange={e => setDayTime(key, 'startTime', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 300 }}
                        sx={{ width: 130 }}
                      />
                      <Typography variant="body2" color="text.secondary">to</Typography>
                      <TextField
                        id={`avail-end-${key}`}
                        type="time"
                        size="small"
                        label="End"
                        value={day.endTime}
                        onChange={e => setDayTime(key, 'endTime', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 300 }}
                        sx={{ width: 130 }}
                      />
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      Not available
                    </Typography>
                  )}
                </Box>
              </React.Fragment>
            );
          })}
        </CardContent>
      </Card>

      {/* Appointment Duration */}
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <CardContent>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5, color: '#374151' }}>
            Appointment Duration
          </Typography>
          <Grid container spacing={1}>
            {DURATION_OPTIONS.map(opt => (
              <Grid item key={opt}>
                <Button
                  id={`duration-btn-${opt}`}
                  variant={duration === opt ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(opt)}
                  sx={{
                    minWidth: 70,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '8px',
                    ...(duration === opt ? { bgcolor: '#2563eb' } : {}),
                  }}
                >
                  {opt < 60 ? `${opt} min` : `${opt / 60}h`}
                </Button>
              </Grid>
            ))}
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Each booked slot will occupy {duration} minute{duration !== 1 ? 's' : ''}.
          </Typography>
        </CardContent>
      </Card>

      {/* Success snackbar */}
      <Snackbar
        open={!!successMsg}
        autoHideDuration={3500}
        onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
