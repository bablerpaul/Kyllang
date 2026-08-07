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
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LockOpenIcon from '@mui/icons-material/LockOpen';

export default function PatientsManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newPatient, setNewPatient] = useState({ name: '', email: '', password: '', bloodGroup: 'O+', phone: '' });

  const [patients, setPatients] = useState([
    { _id: 'PAT-101', name: 'John Doe', email: 'john@example.com', bloodGroup: 'A+', phone: '+1 555-0192', activeConsent: true },
    { _id: 'PAT-102', name: 'Alice Smith', email: 'alice@example.com', bloodGroup: 'O-', phone: '+1 555-0283', activeConsent: true },
    { _id: 'PAT-103', name: 'Robert Johnson', email: 'robert@example.com', bloodGroup: 'B+', phone: '+1 555-0374', activeConsent: false },
    { _id: 'PAT-104', name: 'Emma Watson', email: 'emma@example.com', bloodGroup: 'AB+', phone: '+1 555-0465', activeConsent: true },
  ]);

  const handleRegister = (e) => {
    e.preventDefault();
    const created = {
      _id: `PAT-${100 + patients.length + 1}`,
      name: newPatient.name,
      email: newPatient.email,
      bloodGroup: newPatient.bloodGroup,
      phone: newPatient.phone,
      activeConsent: true,
    };
    setPatients([created, ...patients]);
    setOpenDialog(false);
    setNewPatient({ name: '', email: '', password: '', bloodGroup: 'O+', phone: '' });
  };

  const filtered = patients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.email.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Patients Directory
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Manage registered patients, patient profiles, and active consent controls
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Register New Patient
        </Button>
      </Box>

      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search patients by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#94a3b8' }} />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Patient ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email Address</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Blood Group</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Contact Phone</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Consent Status</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((patient) => (
              <TableRow key={patient._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>{patient._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{patient.name}</TableCell>
                <TableCell>{patient.email}</TableCell>
                <TableCell><Chip label={patient.bloodGroup} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 700 }} /></TableCell>
                <TableCell>{patient.phone}</TableCell>
                <TableCell>
                  {patient.activeConsent ? (
                    <Chip label="Active Consent" size="small" color="success" icon={<LockOpenIcon />} />
                  ) : (
                    <Chip label="Consent Required" size="small" color="warning" />
                  )}
                </TableCell>
                <TableCell textAlign="right" sx={{ textAlign: 'right' }}>
                  <Button size="small" startIcon={<VisibilityIcon />} sx={{ textTransform: 'none' }}>
                    View EMR
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Register Patient Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleRegister}>
          <DialogTitle sx={{ fontWeight: 700 }}>Register New Patient</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField fullWidth label="Full Name" required value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Email Address" type="email" required value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Password" type="password" required value={newPatient.password} onChange={(e) => setNewPatient({ ...newPatient, password: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Blood Group" value={newPatient.bloodGroup} onChange={(e) => setNewPatient({ ...newPatient, bloodGroup: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Phone Number" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: '#2563eb' }}>Register Patient</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
