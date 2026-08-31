import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function AppointmentsManager() {
  const { role, name } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newAppt, setNewAppt] = useState({
    doctorId: '',
    patientId: '',
    appointmentDate: '',
    timeSlot: '09:00 AM',
    reason: '',
  });

  const isPatient = role === 'general_user';
  const isAdmin = role === 'hospital_admin';
  const isDoctor = role === 'doctor';

  // Fetch appointments from the API (backend filters by role automatically)
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/emr/appointments');
      const data = res?.data || res || [];
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch appointments:', err);
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiFetch('/api/doctor/all');
      const data = res?.data || res || [];
      setDoctorsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch doctors:', err);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchDoctors();
  }, [fetchAppointments, fetchDoctors]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/emr/appointments', {
        method: 'POST',
        body: JSON.stringify(newAppt),
      });
      setOpenDialog(false);
      setNewAppt({ doctorId: '', patientId: '', appointmentDate: '', timeSlot: '09:00 AM', reason: '' });
      fetchAppointments(); // Refresh the list
    } catch (err) {
      console.error('Failed to create appointment:', err);
      setError(err.message || 'Failed to book appointment');
    }
  };

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
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderDialog = () => (
    <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
      <form onSubmit={handleCreate}>
        <DialogTitle sx={{ fontWeight: 700 }}>Book Consultation Appointment</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {isAdmin && (
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Patient ID"
                  value={newAppt.patientId}
                  onChange={(e) => setNewAppt({ ...newAppt, patientId: e.target.value })}
                  required
                  helperText="MongoDB ObjectId of the patient"
                />
              </Grid>
            )}
            <Grid item xs={isAdmin ? 6 : 12}>
              <TextField
                select
                fullWidth
                label="Select Doctor"
                value={newAppt.doctorId}
                onChange={(e) => setNewAppt({ ...newAppt, doctorId: e.target.value })}
                required
              >
                {doctorsList.length === 0 ? (
                  <MenuItem disabled value="">
                    No doctors available
                  </MenuItem>
                ) : (
                  doctorsList.map((doc) => (
                    <MenuItem key={doc._id} value={doc._id}>
                      {doc.user?.name || doc.name || 'Unknown Doctor'} {doc.specialty ? `- ${doc.specialty}` : ''}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="date"
                label="Appointment Date"
                InputLabelProps={{ shrink: true }}
                value={newAppt.appointmentDate}
                onChange={(e) => setNewAppt({ ...newAppt, appointmentDate: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Time Slot"
                value={newAppt.timeSlot}
                onChange={(e) => setNewAppt({ ...newAppt, timeSlot: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Reason for Visit"
                value={newAppt.reason}
                onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}
                required
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button type="submit" variant="contained" sx={{ bgcolor: '#2563eb' }}>Book Slot</Button>
        </DialogActions>
      </form>
    </Dialog>
  );

  // ── Patient-specific view ──────────────────────────────────────────────
  if (isPatient) {
    return (
      <Box>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
              My Appointments
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Your consultation history and upcoming scheduled visits
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchAppointments}
              disabled={loading}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenDialog(true)}
              sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
            >
              Book Appointment
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <Table>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Time Slot</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Doctor</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    <EventIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                    <Typography variant="body1">No appointments found</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Your upcoming and past appointments will appear here
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((apt) => (
                  <TableRow key={apt._id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {formatDate(apt.appointmentDate)}
                    </TableCell>
                    <TableCell>{apt.timeSlot || '—'}</TableCell>
                    <TableCell>
                      {apt.doctor?.name || apt.doctorName || '—'}
                      {apt.doctor?.specialty && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                          {apt.doctor.specialty}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{apt.reason || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={(apt.status || 'scheduled').toUpperCase()}
                        size="small"
                        color={getStatusColor(apt.status)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {renderDialog()}
      </Box>
    );
  }

  // ── Admin / Doctor view ────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Appointments Scheduler
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {isDoctor
              ? 'Your patient consultations and scheduled visits'
              : 'Schedule patient consultations, track visit status, and coordinate specialist slots'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchAppointments}
            disabled={loading}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
            sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
          >
            Book Appointment
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Time Slot</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Reason / Service</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : appointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <EventIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                  <Typography variant="body1">No appointments scheduled</Typography>
                </TableCell>
              </TableRow>
            ) : (
              appointments.map((apt) => (
                <TableRow key={apt._id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {formatDate(apt.appointmentDate)}
                  </TableCell>
                  <TableCell>{apt.timeSlot || '—'}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {apt.patient?.name || apt.patientName || '—'}
                    {apt.patient?.email && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {apt.patient.email}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {apt.doctor?.name || apt.doctorName || '—'}
                    {apt.doctor?.specialty && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {apt.doctor.specialty}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{apt.reason || '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={(apt.status || 'scheduled').toUpperCase()}
                      size="small"
                      color={getStatusColor(apt.status)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {renderDialog()}
    </Box>
  );
}
