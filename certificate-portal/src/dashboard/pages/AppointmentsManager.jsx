import React, { useState } from 'react';
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
  Grid,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AddIcon from '@mui/icons-material/Add';

export default function AppointmentsManager() {
  const [openDialog, setOpenDialog] = useState(false);
  const [appointments, setAppointments] = useState([
    { _id: 'APT-301', patientName: 'John Doe', doctorName: 'Dr. Sarah Jenkins', date: '2026-07-28', time: '10:30 AM', reason: 'Cardiology Follow-up', status: 'scheduled' },
    { _id: 'APT-302', patientName: 'Alice Smith', doctorName: 'Dr. Marcus Vance', date: '2026-07-29', time: '02:00 PM', reason: 'Neurology Consultation', status: 'completed' },
    { _id: 'APT-303', patientName: 'Emma Watson', doctorName: 'Dr. Elena Rostova', date: '2026-07-30', time: '11:15 AM', reason: 'General Wellness Exam', status: 'scheduled' },
  ]);

  const [newAppt, setNewAppt] = useState({ patientName: 'John Doe', doctorName: 'Dr. Sarah Jenkins', date: '2026-08-01', time: '09:00 AM', reason: 'Routine Checkup' });

  const handleCreate = (e) => {
    e.preventDefault();
    setAppointments([{ _id: `APT-${300 + appointments.length + 1}`, ...newAppt, status: 'scheduled' }, ...appointments]);
    setOpenDialog(false);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Appointments Scheduler
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Schedule patient consultations, track visit status, and coordinate specialist slots
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Book Appointment
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Appointment ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Attending Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Date & Time</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Reason / Service</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {appointments.map((apt) => (
              <TableRow key={apt._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>{apt._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{apt.patientName}</TableCell>
                <TableCell>{apt.doctorName}</TableCell>
                <TableCell>{apt.date} at {apt.time}</TableCell>
                <TableCell>{apt.reason}</TableCell>
                <TableCell>
                  <Chip
                    label={apt.status.toUpperCase()}
                    size="small"
                    color={apt.status === 'completed' ? 'success' : 'primary'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Book Consultation Appointment</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Patient Name" value={newAppt.patientName} onChange={(e) => setNewAppt({ ...newAppt, patientName: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Doctor Name" value={newAppt.doctorName} onChange={(e) => setNewAppt({ ...newAppt, doctorName: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth type="date" label="Date" InputLabelProps={{ shrink: true }} value={newAppt.date} onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Time Slot" value={newAppt.time} onChange={(e) => setNewAppt({ ...newAppt, time: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Reason for Visit" value={newAppt.reason} onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: '#2563eb' }}>Book Slot</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
