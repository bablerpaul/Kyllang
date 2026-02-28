import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  Person as PersonIcon,
  MedicalServices as MedicalServicesIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const DoctorAssignment = () => {
  const [users, setUsers] = useState([]);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [unassignedDialog, setUnassignedDialog] = useState({ open: false, patientId: null, patientName: '' });

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAssignDoctor = async () => {
    if (!selectedPatientId || !selectedDoctorId) {
      alert('Please select both a patient and a doctor');
      return;
    }

    try {
      await apiFetch('/api/admin/assign', {
        method: 'POST',
        body: JSON.stringify({ doctorId: selectedDoctorId, patientId: selectedPatientId })
      });

      // Reset selections
      setSelectedPatientId('');
      setSelectedDoctorId('');

      alert('✅ Doctor assigned successfully!');
      fetchUsers();
    } catch (error) {
      alert(`Error assigning doctor: ${error.message}`);
    }
  };

  const handleRemoveAssignment = (patientId, patientName) => {
    // Note: The prompt doesn't strictly ask for 'Unassign' and we haven't built a backend endpoint for it.
    alert('For this Proof of Concept, unassigning is not supported on the backend.');
  };

  const confirmRemoveAssignment = () => {
    setUnassignedDialog({ open: false, patientId: null, patientName: '' });
  };

  const patients = users.filter(u => u.role === 'general_user');
  const activeDoctors = users.filter(u => u.role === 'doctor');

  // Calculate assignments
  const assignedPatientIds = new Set();
  const assignments = [];

  activeDoctors.forEach(doctor => {
    if (doctor.assignedPatients && Array.isArray(doctor.assignedPatients)) {
      doctor.assignedPatients.forEach(pId => {
        const idStr = typeof pId === 'object' ? (pId._id || pId.id || pId).toString() : pId.toString();
        assignedPatientIds.add(idStr);
        const pObj = patients.find(p => (p._id || p.id).toString() === idStr);
        if (pObj) {
          assignments.push({
            patientId: pObj._id || pObj.id,
            patientName: pObj.name,
            patientEmail: pObj.email,
            doctorId: doctor._id || doctor.id,
            doctorName: doctor.name,
            doctorSpecialty: doctor.specialty,
          });
        }
      });
    }
  });

  const unassignedPatients = patients.filter(patient => !assignedPatientIds.has((patient._id || patient.id).toString()));

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssignmentIcon /> Doctor Assignment Management
      </Typography>

      {/* Assignment Form */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Assign Doctor to Patient
          </Typography>

          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} md={5}>
              <FormControl fullWidth>
                <InputLabel>Select Patient</InputLabel>
                <Select
                  value={selectedPatientId}
                  label="Select Patient"
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Select a patient</em>
                  </MenuItem>
                  {unassignedPatients.map((patient) => (
                    <MenuItem key={patient._id || patient.id} value={patient._id || patient.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" />
                        {patient.name} ({patient.email})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={5}>
              <FormControl fullWidth>
                <InputLabel>Select Doctor</InputLabel>
                <Select
                  value={selectedDoctorId}
                  label="Select Doctor"
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Select a doctor</em>
                  </MenuItem>
                  {activeDoctors.map((doctor) => (
                    <MenuItem key={doctor._id || doctor.id} value={doctor._id || doctor.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MedicalServicesIcon fontSize="small" />
                        {doctor.name} ({doctor.specialty || 'General'})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <Button
                variant="contained"
                fullWidth
                startIcon={<CheckCircleIcon />}
                onClick={handleAssignDoctor}
                disabled={!selectedPatientId || !selectedDoctorId}
              >
                Assign
              </Button>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            Only unassigned patients are shown. Patients already assigned to doctors appear in the table below.
          </Alert>
        </CardContent>
      </Card>

      {/* Current Assignments Table */}
      <Card elevation={2}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Current Doctor Assignments ({assignments.length})
            </Typography>
            <Chip
              label={`${unassignedPatients.length} unassigned patients`}
              color="warning"
              variant="outlined"
            />
          </Box>

          {assignments.length === 0 ? (
            <Alert severity="info">
              No doctor assignments found. Assign doctors to patients using the form above.
            </Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Patient</strong></TableCell>
                    <TableCell><strong>Patient ID</strong></TableCell>
                    <TableCell><strong>Assigned Doctor</strong></TableCell>
                    <TableCell><strong>Doctor Specialty</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assignments.map((assignment) => {
                    return (
                      <TableRow key={assignment.patientId} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonIcon fontSize="small" />
                            {assignment.patientName}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={assignment.patientId} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MedicalServicesIcon fontSize="small" />
                            {assignment.doctorName}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={assignment.doctorSpecialty || 'N/A'} size="small" />
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveAssignment(assignment.patientId, assignment.patientName)}
                            title="Remove Assignment"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <Grid container spacing={2} sx={{ mt: 3 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary.main">
              {assignments.length}
            </Typography>
            <Typography variant="caption">Active Assignments</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="warning.main">
              {unassignedPatients.length}
            </Typography>
            <Typography variant="caption">Unassigned Patients</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main">
              {activeDoctors.length}
            </Typography>
            <Typography variant="caption">Available Doctors</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Remove Assignment Dialog */}
      <Dialog open={unassignedDialog.open} onClose={() => setUnassignedDialog({ open: false, patientId: null, patientName: '' })}>
        <DialogTitle>Remove Doctor Assignment</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Are you sure you want to remove the doctor assignment for {unassignedDialog.patientName}?
          </Alert>
          <Typography variant="body2">
            The patient will become unassigned and will need a new doctor assignment for medical care coordination.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnassignedDialog({ open: false, patientId: null, patientName: '' })}>
            Cancel
          </Button>
          <Button onClick={confirmRemoveAssignment} color="error" variant="contained">
            Remove Assignment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DoctorAssignment;