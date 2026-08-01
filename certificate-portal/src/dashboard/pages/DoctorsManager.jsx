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
  Avatar,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

export default function DoctorsManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newDoctor, setNewDoctor] = useState({ name: '', email: '', password: '', specialty: 'Cardiology', licenseNumber: '', consultationFee: 100 });

  const [doctors, setDoctors] = useState([
    { _id: 'DOC-901', name: 'Dr. Sarah Jenkins', email: 'sarah.jenkins@hospital.org', specialty: 'Cardiology', licenseNumber: 'DOC-NY-98123', consultationFee: '$150' },
    { _id: 'DOC-902', name: 'Dr. Marcus Vance', email: 'marcus.vance@hospital.org', specialty: 'Neurology', licenseNumber: 'DOC-NY-98124', consultationFee: '$180' },
    { _id: 'DOC-903', name: 'Dr. Elena Rostova', email: 'elena.rostova@hospital.org', specialty: 'Pediatrics', licenseNumber: 'DOC-NY-98125', consultationFee: '$120' },
    { _id: 'DOC-904', name: 'Dr. James Chen', email: 'james.chen@hospital.org', specialty: 'Orthopedics', licenseNumber: 'DOC-NY-98126', consultationFee: '$160' },
  ]);

  const handleRegister = (e) => {
    e.preventDefault();
    const created = {
      _id: `DOC-${900 + doctors.length + 1}`,
      name: newDoctor.name,
      email: newDoctor.email,
      specialty: newDoctor.specialty,
      licenseNumber: newDoctor.licenseNumber || `DOC-NY-${Math.floor(Math.random() * 89999 + 10000)}`,
      consultationFee: `$${newDoctor.consultationFee}`,
    };
    setDoctors([created, ...doctors]);
    setOpenDialog(false);
    setNewDoctor({ name: '', email: '', password: '', specialty: 'Cardiology', licenseNumber: '', consultationFee: 100 });
  };

  const filtered = doctors.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.specialty.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Doctors Roster
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Medical specialists, license numbers, consultation fees, and patient assignments
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#0284c7', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Add Doctor Specialist
        </Button>
      </Box>

      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search doctors by name or medical specialty..."
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
              <TableCell sx={{ fontWeight: 700 }}>Doctor ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Doctor Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Specialty</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>License Number</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email Address</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Consultation Fee</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((doctor) => (
              <TableRow key={doctor._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#0284c7' }}>{doctor._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{doctor.name}</TableCell>
                <TableCell><Chip label={doctor.specialty} size="small" color="primary" variant="outlined" /></TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{doctor.licenseNumber}</TableCell>
                <TableCell>{doctor.email}</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#16a34a' }}>{doctor.consultationFee}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Doctor Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleRegister}>
          <DialogTitle sx={{ fontWeight: 700 }}>Add Doctor Specialist</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField fullWidth label="Doctor Name" required value={newDoctor.name} onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Email Address" type="email" required value={newDoctor.email} onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Password" type="password" required value={newDoctor.password} onChange={(e) => setNewDoctor({ ...newDoctor, password: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Medical Specialty" required value={newDoctor.specialty} onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="License Number" required value={newDoctor.licenseNumber} onChange={(e) => setNewDoctor({ ...newDoctor, licenseNumber: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: '#0284c7' }}>Save Doctor</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
