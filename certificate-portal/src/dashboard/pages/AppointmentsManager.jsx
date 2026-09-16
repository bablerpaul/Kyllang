import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Skeleton,
  Alert,
  CircularProgress,
  Divider,
  Snackbar,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Menu,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

import { apiFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import DoctorAvailabilityManager from '../../components/pages/doctor/DoctorAvailabilityManager';
import CreateEMRDialog from '../../components/pages/doctor/CreateEMRDialog';

// Today's date in YYYY-MM-DD format — used as min for the date picker
const todayISO = new Date().toISOString().split('T')[0];

export default function AppointmentsManager() {
  const { role } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Booking form state
  const [newAppt, setNewAppt] = useState({
    doctorId: '',
    patientId: '',
    appointmentDate: '',
    timeSlot: '',
    reason: '',
  });

  // Slot picker state
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMsg, setSlotsMsg] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Status Action states
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);

  // EMR Dialog state
  const [emrDialogOpen, setEmrDialogOpen] = useState(false);

  // Doctor Action Menu state
  const [anchorEl, setAnchorEl] = useState(null);

  // Reschedule dialog state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ appointmentDate: '', timeSlot: '' });
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsMsg, setRescheduleSlotsMsg] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  const isPatient = role === 'general_user';
  const isAdmin = role === 'hospital_admin';
  const isDoctor = role === 'doctor';

  // ── Fetch appointments ─────────────────────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/appointments');
      const data = res?.data || res || [];
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch doctor list ──────────────────────────────────────────────────
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiFetch('/api/doctor/all');
      const data = res?.data || res || [];
      setDoctorsList(Array.isArray(data) ? data : []);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchDoctors();
  }, [fetchAppointments, fetchDoctors]);

  // ── Fetch available slots ─────────────────────────────────────────────
  const fetchSlots = useCallback(async (doctorId, date) => {
    if (!doctorId || !date) {
      setAvailableSlots([]);
      setSlotsMsg('');
      return;
    }
    setSlotsLoading(true);
    setSlotsMsg('');
    setAvailableSlots([]);
    try {
      const res = await apiFetch(`/api/doctor/${doctorId}/slots?date=${date}`);
      if (res?.slots?.length > 0) {
        setAvailableSlots(res.slots);
      } else {
        setAvailableSlots([]);
        setSlotsMsg(res?.message || 'No available slots for this date.');
      }
    } catch (err) {
      setSlotsMsg('Could not load slots: ' + (err.message || 'Unknown error'));
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    setNewAppt((prev) => ({ ...prev, timeSlot: '' }));
    fetchSlots(newAppt.doctorId, newAppt.appointmentDate);
  }, [newAppt.doctorId, newAppt.appointmentDate, fetchSlots]);

  // ── Book appointment ───────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setBookingError('');
    if (!newAppt.timeSlot) {
      setBookingError('Please select an available time slot.');
      return;
    }
    try {
      await apiFetch('/api/emr/appointments', {
        method: 'POST',
        body: JSON.stringify(newAppt),
      });
      setOpenDialog(false);
      setNewAppt({ doctorId: '', patientId: '', appointmentDate: '', timeSlot: '', reason: '' });
      setAvailableSlots([]);
      setSlotsMsg('');
      setSuccessMsg('Appointment booked successfully!');
      fetchAppointments();
    } catch (err) {
      if (err.message?.includes('409') || err.message?.toLowerCase().includes('already booked')) {
        setBookingError('This appointment slot was just booked by another patient. Please select another available time.');
        fetchSlots(newAppt.doctorId, newAppt.appointmentDate);
        setNewAppt((prev) => ({ ...prev, timeSlot: '' }));
      } else {
        setBookingError(err.message || 'Failed to book appointment. Please try again.');
      }
    }
  };

  const handleOpenDialog = () => {
    setNewAppt({ doctorId: '', patientId: '', appointmentDate: '', timeSlot: '', reason: '' });
    setAvailableSlots([]);
    setSlotsMsg('');
    setBookingError('');
    setOpenDialog(true);
  };

  // ── Update Appointment Status ──────────────────────────────────────────
  const handleUpdateStatus = async (apptId, newStatus) => {
    setStatusUpdating(true);
    setAnchorEl(null);
    try {
      const res = await apiFetch(`/api/appointments/${apptId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      // Update the specific appointment in local state immediately (no full reload)
      const updatedAppt = res?.data || null;
      if (updatedAppt) {
        setAppointments((prev) =>
          prev.map((a) => (a._id === apptId ? { ...a, status: updatedAppt.status } : a))
        );
      } else {
        fetchAppointments();
      }
      setSuccessMsg(
        newStatus === 'cancelled'
          ? 'Appointment cancelled successfully.'
          : `Appointment marked as ${newStatus}`
      );
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setStatusUpdating(false);
      setCancelDialogOpen(false);
    }
  };

  const openCancelDialog = (appt) => {
    setSelectedAppt(appt);
    setCancelDialogOpen(true);
  };

  const openDoctorMenu = (e, appt) => {
    setAnchorEl(e.currentTarget);
    setSelectedAppt(appt);
  };

  const handleOpenEMRDialog = (appt) => {
    setSelectedAppt(appt);
    setEmrDialogOpen(true);
  };

  // ── Reschedule handlers ────────────────────────────────────────────────
  const openRescheduleDialog = (appt) => {
    setSelectedAppt(appt);
    setRescheduleForm({ appointmentDate: '', timeSlot: '' });
    setRescheduleSlots([]);
    setRescheduleSlotsMsg('');
    setRescheduleError('');
    setRescheduleDialogOpen(true);
  };

  // Fetch available slots for rescheduling when date changes
  const fetchRescheduleSlots = useCallback(async (doctorId, date) => {
    if (!doctorId || !date) {
      setRescheduleSlots([]);
      setRescheduleSlotsMsg('');
      return;
    }
    setRescheduleSlotsLoading(true);
    setRescheduleSlotsMsg('');
    setRescheduleSlots([]);
    try {
      const res = await apiFetch(`/api/doctor/${doctorId}/slots?date=${date}`);
      if (res?.slots?.length > 0) {
        setRescheduleSlots(res.slots);
      } else {
        setRescheduleSlotsMsg(res?.message || 'No available slots for this date.');
      }
    } catch (err) {
      setRescheduleSlotsMsg('Could not load slots: ' + (err.message || 'Unknown error'));
    } finally {
      setRescheduleSlotsLoading(false);
    }
  }, []);

  // Derive the doctor's Doctor._id from the selected appointment
  const getRescheduleDocId = () => selectedAppt?.doctor?._id || selectedAppt?.doctor || null;

  const handleReschedule = async () => {
    if (!rescheduleForm.appointmentDate || !rescheduleForm.timeSlot) {
      setRescheduleError('Please select a new date and time slot.');
      return;
    }
    setRescheduleLoading(true);
    setRescheduleError('');
    try {
      const res = await apiFetch(`/api/appointments/${selectedAppt._id}/reschedule`, {
        method: 'PUT',
        body: JSON.stringify({
          appointmentDate: rescheduleForm.appointmentDate,
          timeSlot: rescheduleForm.timeSlot,
        }),
      });
      const updated = res?.data;
      if (updated) {
        setAppointments((prev) =>
          prev.map((a) => (a._id === selectedAppt._id ? { ...a, ...updated } : a))
        );
      } else {
        fetchAppointments();
      }
      setSuccessMsg('Appointment rescheduled successfully.');
      setRescheduleDialogOpen(false);
    } catch (err) {
      const msg = err.message || 'Unable to reschedule appointment.';
      if (msg.includes('409') || msg.toLowerCase().includes('already booked')) {
        setRescheduleError('Selected time slot is no longer available. Please choose another.');
        // Refresh slots for the chosen date
        const docId = getRescheduleDocId();
        if (docId) fetchRescheduleSlots(docId, rescheduleForm.appointmentDate);
        setRescheduleForm((prev) => ({ ...prev, timeSlot: '' }));
      } else {
        setRescheduleError(msg);
      }
    } finally {
      setRescheduleLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'scheduled': return 'primary';
      case 'cancelled': return 'error';
      case 'no_show': return 'warning';
      default: return 'default';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getDoctorName = (apt) => apt?.doctor?.user?.name || apt?.doctor?.name || apt?.doctorName || '—';
  const getPatientName = (apt) => apt?.patient?.user?.name || apt?.patient?.name || apt?.patientName || '—';

  // Derive doctor._id string from an appointment (handles populated or ref)
  const getDoctorDocId = (apt) => apt?.doctor?._id?.toString?.() || apt?.doctor?.toString?.() || null;

  // ── Shared UI Components ─────────────────────────────────────────────────
  const renderBookingDialog = () => (
    <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
      <form onSubmit={handleCreate}>
        <DialogTitle sx={{ fontWeight: 700 }}>Book Consultation Appointment</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {isAdmin && (
              <Grid item xs={12}>
                <TextField
                  id="book-patient-id"
                  fullWidth
                  label="Patient ID"
                  value={newAppt.patientId}
                  onChange={(e) => setNewAppt({ ...newAppt, patientId: e.target.value })}
                  required
                  helperText="MongoDB ObjectId of the patient"
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                id="book-doctor-select"
                select
                fullWidth
                label="Select Doctor"
                value={newAppt.doctorId}
                onChange={(e) => setNewAppt({ ...newAppt, doctorId: e.target.value, timeSlot: '' })}
                required
              >
                {doctorsList.length === 0 ? (
                  <MenuItem disabled value="">No doctors available</MenuItem>
                ) : (
                  doctorsList.map((doc) => (
                    <MenuItem key={doc._id} value={doc._id}>
                      {doc.user?.name || doc.name || 'Unknown Doctor'}
                      {doc.specialty ? ` — ${doc.specialty}` : ''}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                id="book-date"
                fullWidth
                type="date"
                label="Appointment Date"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayISO }}
                value={newAppt.appointmentDate}
                onChange={(e) => setNewAppt({ ...newAppt, appointmentDate: e.target.value, timeSlot: '' })}
                required
              />
            </Grid>

            {/* Time Slot Picker */}
            <Grid item xs={12}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#374151' }}>
                Available Time Slots
              </Typography>
              {slotsLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">Loading slots…</Typography>
                </Box>
              )}
              {!slotsLoading && !newAppt.doctorId && !newAppt.appointmentDate && (
                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                  Select a doctor and date to see available times.
                </Typography>
              )}
              {!slotsLoading && (newAppt.doctorId || newAppt.appointmentDate) && availableSlots.length === 0 && slotsMsg && (
                <Alert severity="info" sx={{ py: 0.5 }}>{slotsMsg}</Alert>
              )}
              {!slotsLoading && availableSlots.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot}
                      id={`slot-btn-${slot.replace(/[: ]/g, '-')}`}
                      variant={newAppt.timeSlot === slot ? 'contained' : 'outlined'}
                      size="small"
                      startIcon={<AccessTimeIcon fontSize="small" />}
                      onClick={() => setNewAppt((prev) => ({ ...prev, timeSlot: slot }))}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        ...(newAppt.timeSlot === slot ? { bgcolor: '#2563eb' } : {}),
                      }}
                    >
                      {slot}
                    </Button>
                  ))}
                </Box>
              )}
              {newAppt.timeSlot && (
                <Chip icon={<AccessTimeIcon />} label={`Selected: ${newAppt.timeSlot}`} color="primary" variant="outlined" size="small" sx={{ mt: 1 }} />
              )}
            </Grid>

            <Grid item xs={12}>
              <TextField
                id="book-reason"
                fullWidth
                label="Reason for Visit"
                value={newAppt.reason}
                onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}
                required
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
          {bookingError && <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setBookingError('')}>{bookingError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button id="confirm-booking-btn" type="submit" variant="contained" disabled={!newAppt.timeSlot || slotsLoading} sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600 }}>
            Book Slot
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );

  const renderCancelDialog = () => (
    <Dialog open={cancelDialogOpen} onClose={() => !statusUpdating && setCancelDialogOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Cancel Appointment?</DialogTitle>
      <DialogContent dividers>
        <Typography>
          Are you sure you want to cancel this appointment
          {isDoctor
            ? <> with patient <strong>{getPatientName(selectedAppt)}</strong></>
            : <> with <strong>{getDoctorName(selectedAppt)}</strong></>}
          {' '}on <strong>{formatDate(selectedAppt?.appointmentDate)}</strong> at{' '}
          <strong>{selectedAppt?.timeSlot}</strong>?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          id="keep-appointment-btn"
          onClick={() => setCancelDialogOpen(false)}
          disabled={statusUpdating}
          variant="outlined"
        >
          Keep Appointment
        </Button>
        <Button
          id="confirm-cancel-btn"
          onClick={() => handleUpdateStatus(selectedAppt?._id, 'cancelled')}
          color="error"
          variant="contained"
          disabled={statusUpdating}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {statusUpdating ? <CircularProgress size={20} color="inherit" /> : 'Cancel Appointment'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderDoctorMenu = () => (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
      <MenuItem onClick={() => handleUpdateStatus(selectedAppt?._id, 'completed')} disabled={statusUpdating}>Mark as Completed</MenuItem>
      <MenuItem onClick={() => handleUpdateStatus(selectedAppt?._id, 'no_show')} disabled={statusUpdating}>Mark as No Show</MenuItem>
      <MenuItem
        onClick={() => {
          setAnchorEl(null);
          openCancelDialog(selectedAppt);
        }}
        disabled={statusUpdating}
        sx={{ color: 'error.main' }}
      >
        Cancel Appointment
      </MenuItem>
    </Menu>
  );

  // ── Reschedule Dialog ──────────────────────────────────────────────────
  const renderRescheduleDialog = () => {
    const docId = selectedAppt ? getDoctorDocId(selectedAppt) : null;
    return (
      <Dialog
        open={rescheduleDialogOpen}
        onClose={() => !rescheduleLoading && setRescheduleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <EventRepeatIcon color="primary" />
          Reschedule Appointment
        </DialogTitle>
        <DialogContent dividers>
          {/* Original appointment summary */}
          <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', p: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Original Appointment</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <strong>Patient:</strong> {getPatientName(selectedAppt)}
            </Typography>
            <Typography variant="body2">
              <strong>Date:</strong> {formatDate(selectedAppt?.appointmentDate)}
            </Typography>
            <Typography variant="body2">
              <strong>Time:</strong> {selectedAppt?.timeSlot}
            </Typography>
            <Typography variant="body2">
              <strong>Reason:</strong> {selectedAppt?.reason}
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                id="reschedule-date"
                fullWidth
                type="date"
                label="New Appointment Date"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayISO }}
                value={rescheduleForm.appointmentDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setRescheduleForm((prev) => ({ ...prev, appointmentDate: newDate, timeSlot: '' }));
                  if (docId && newDate) fetchRescheduleSlots(docId, newDate);
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#374151' }}>
                Available Time Slots
              </Typography>
              {rescheduleSlotsLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">Loading slots…</Typography>
                </Box>
              )}
              {!rescheduleSlotsLoading && !rescheduleForm.appointmentDate && (
                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                  Select a new date to see available times.
                </Typography>
              )}
              {!rescheduleSlotsLoading && rescheduleForm.appointmentDate && rescheduleSlots.length === 0 && rescheduleSlotsMsg && (
                <Alert severity="info" sx={{ py: 0.5 }}>{rescheduleSlotsMsg}</Alert>
              )}
              {!rescheduleSlotsLoading && rescheduleSlots.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {rescheduleSlots.map((slot) => (
                    <Button
                      key={slot}
                      id={`rslot-btn-${slot.replace(/[: ]/g, '-')}`}
                      variant={rescheduleForm.timeSlot === slot ? 'contained' : 'outlined'}
                      size="small"
                      startIcon={<AccessTimeIcon fontSize="small" />}
                      onClick={() => setRescheduleForm((prev) => ({ ...prev, timeSlot: slot }))}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        ...(rescheduleForm.timeSlot === slot ? { bgcolor: '#2563eb' } : {}),
                      }}
                    >
                      {slot}
                    </Button>
                  ))}
                </Box>
              )}
              {rescheduleForm.timeSlot && (
                <Chip
                  icon={<AccessTimeIcon />}
                  label={`Selected: ${rescheduleForm.timeSlot}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1 }}
                />
              )}
            </Grid>
          </Grid>

          {rescheduleError && (
            <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setRescheduleError('')}>
              {rescheduleError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            id="cancel-reschedule-btn"
            onClick={() => setRescheduleDialogOpen(false)}
            disabled={rescheduleLoading}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            id="confirm-reschedule-btn"
            onClick={handleReschedule}
            variant="contained"
            color="primary"
            disabled={rescheduleLoading || !rescheduleForm.timeSlot}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {rescheduleLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirm Reschedule'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // ── Appointment Cards ────────────────────────────────────────────────────
  const renderAppointmentCards = () => {
    if (loading) {
      return (
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={6} lg={4} key={i}>
              <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                <CardContent><Skeleton height={120} /></CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      );
    }
    if (appointments.length === 0) {
      return (
        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', py: 8, textAlign: 'center' }}>
          <EventIcon sx={{ fontSize: 64, mb: 2, opacity: 0.2 }} />
          <Typography variant="h6" color="text.secondary">No appointments scheduled</Typography>
          <Typography variant="body2" color="text.secondary">Your upcoming and past appointments will appear here.</Typography>
        </Paper>
      );
    }

    return (
      <Grid container spacing={3}>
        {appointments.map((apt) => (
          <Grid item xs={12} md={6} lg={4} key={apt._id}>
            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', border: '1px solid #e2e8f0', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Chip label={(apt.status || 'scheduled').toUpperCase()} size="small" color={getStatusColor(apt.status)} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
                  {isDoctor && apt.status === 'scheduled' && (
                    <IconButton size="small" onClick={(e) => openDoctorMenu(e, apt)}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EventIcon fontSize="small" color="primary" /> {formatDate(apt.appointmentDate)}
                </Typography>
                <Typography variant="subtitle1" sx={{ color: '#334155', display: 'flex', alignItems: 'center', gap: 1, mb: 2, fontWeight: 600 }}>
                  <AccessTimeIcon fontSize="small" /> {apt.timeSlot || '—'}
                </Typography>
                
                <Divider sx={{ mb: 2 }} />
                
                {isPatient || isAdmin ? (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MedicalServicesIcon fontSize="small" /> Doctor
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{getDoctorName(apt)}</Typography>
                    {apt.doctor?.specialty && <Typography variant="caption" color="text.secondary">{apt.doctor.specialty}</Typography>}
                  </Box>
                ) : null}

                {isDoctor || isAdmin ? (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon fontSize="small" /> Patient
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{getPatientName(apt)}</Typography>
                    {apt.patient?.user?.email && <Typography variant="caption" color="text.secondary">{apt.patient.user.email}</Typography>}
                  </Box>
                ) : null}

                  <Box sx={{ bgcolor: '#f8fafc', p: 1.5, borderRadius: '8px' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Reason for Visit</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{apt.reason || '—'}</Typography>
                  </Box>

                  {/* Rescheduled-from notice (shown when applicable) */}
                  {apt.rescheduledFrom?.appointmentDate && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5 }}>
                      <EventRepeatIcon fontSize="small" sx={{ color: '#64748b', fontSize: '0.9rem' }} />
                      <Typography variant="caption" color="text.secondary">
                        Rescheduled from{' '}
                        <strong>{formatDate(apt.rescheduledFrom.appointmentDate)}</strong>,{' '}
                        {apt.rescheduledFrom.timeSlot}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
                {(isPatient || isAdmin) && apt.status === 'scheduled' && (
                  <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                    <Button fullWidth variant="outlined" color="error" size="small" onClick={() => openCancelDialog(apt)} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}>
                      Cancel Appointment
                    </Button>
                  </CardActions>
                )}
                {isDoctor && (apt.status === 'scheduled' || apt.status === 'completed') && (
                  <CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 1 }}>
                    {apt.status === 'scheduled' && (
                      <Button
                        id={`cancel-appt-btn-${apt._id}`}
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => openCancelDialog(apt)}
                        disabled={statusUpdating}
                        sx={{ flex: 1, textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
                      >
                        Cancel Appointment
                      </Button>
                    )}
                    <Button
                      id={`create-emr-btn-${apt._id}`}
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={() => handleOpenEMRDialog(apt)}
                      sx={{ flex: 1, textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
                    >
                      Create EMR
                    </Button>
                  </CardActions>
                )}
                {/* Reschedule button: doctor only, cancelled appointments only */}
                {isDoctor && apt.status === 'cancelled' && (
                  <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                    <Button
                      id={`reschedule-btn-${apt._id}`}
                      fullWidth
                      variant="outlined"
                      color="primary"
                      size="small"
                      startIcon={<EventRepeatIcon />}
                      onClick={() => openRescheduleDialog(apt)}
                      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
                    >
                      Reschedule Appointment
                    </Button>
                  </CardActions>
                )}
              </Card>
          </Grid>
        ))}
      </Grid>
    );
  };

  // ── Main Render ────────────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            {isPatient ? 'My Appointments' : 'Appointments Scheduler'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {isPatient ? 'Your consultation history and upcoming scheduled visits' : 'Manage patient consultations and scheduled visits'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchAppointments} disabled={loading} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}>
            Refresh
          </Button>
          {(isPatient || isAdmin) && (
            <Button id="book-appointment-btn" variant="contained" startIcon={<AddIcon />} onClick={handleOpenDialog} sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}>
              Book Appointment
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {isDoctor && (
        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', p: 3, mb: 4 }}>
          <DoctorAvailabilityManager />
        </Paper>
      )}

      {renderAppointmentCards()}

      {renderBookingDialog()}
      {renderCancelDialog()}
      {renderDoctorMenu()}
      {renderRescheduleDialog()}

      {selectedAppt && (
        <CreateEMRDialog
          open={emrDialogOpen}
          onClose={() => {
            setEmrDialogOpen(false);
            fetchAppointments(); // Refresh appointments after creation (optional)
          }}
          appointment={selectedAppt}
        />
      )}

      <Snackbar open={!!successMsg} autoHideDuration={4000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
}
