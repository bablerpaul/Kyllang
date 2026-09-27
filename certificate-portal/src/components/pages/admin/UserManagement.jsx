import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Person as PersonIcon,
  MedicalServices as MedicalServicesIcon,
  Edit as EditIcon,
  VerifiedUser as VerifiedUserIcon,
  People as PeopleIcon,
  ContentCopy as ContentCopyIcon,
  Download as DownloadIcon,
  PersonAdd as PersonAddIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
// No existing public verification endpoint/payload for a hospital ID card holder exists in this
// app (T3-R1 Bug 10) — removed the unused QR import rather than inventing a new QR workflow.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import UserRegistrationModal from './UserRegistrationModal';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: null, name: '' });
  const [privateKeyDialog, setPrivateKeyDialog] = useState({ open: false, key: '', email: '', name: '', role: '' });
  const idCardRef = useRef(null);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      const usersArray = res.data || res;
      setUsers(Array.isArray(usersArray) ? usersArray : []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRegistrationSuccess = (payloadData, form, role) => {
    // Show ID Card generation dialog
    setPrivateKeyDialog({ 
      open: true, 
      key: '', // Private keys are no longer generated backend
      email: payloadData.user?.email || form.email, 
      name: payloadData.user?.name || form.name, 
      role: payloadData.user?.role || role 
    });
    setModalOpen(false);
    fetchUsers();
  };

  const handleDelete = (type, id, name) => {
    setDeleteDialog({ open: true, type, id, name });
  };

  const confirmDelete = async () => {
    const { id } = deleteDialog;
    setDeleteDialog({ open: false, type: '', id: null, name: '' });
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (error) {
      alert(error.message || 'Failed to delete user');
    }
  };

  const handleDownloadIDCard = async () => {
    if (!idCardRef.current) return;

    try {
      const canvas = await html2canvas(idCardRef.current, {
        scale: 4, // High scale for clear print
        backgroundColor: null
      });

      const imgData = canvas.toDataURL('image/png');

      // CR80 ID Card dimensions: 85.6mm x 53.98mm (standard ATM card)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [85.6, 54]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 54);
      pdf.save(`${privateKeyDialog.name.replace(/\s+/g, '_')}_ID_Card.pdf`);
    } catch (err) {
      console.error("Failed to generate ID Card", err);
      alert("Failed to download ID card.");
    }
  };

  const patients = users.filter(u => u.role === 'general_user');
  const doctors = users.filter(u => u.role === 'doctor');
  const insuranceOfficers = users.filter(u => u.role === 'insurance_officer');
  // GET /api/admin/users intentionally excludes hospital_admin accounts server-side
  // (backend/controllers/adminController.js::getAllUsers) — never populate this from `users`.
  const admins = []; // Hide admins for now in UI

  return (
    <Box>
      <Dialog open={privateKeyDialog.open} onClose={() => setPrivateKeyDialog({ ...privateKeyDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>User Created - Access ID Card</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A new user was generated for {privateKeyDialog.name} ({privateKeyDialog.email}).
            You can download their Hospital ID card below.
          </DialogContentText>

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2, alignItems: 'center', flexDirection: 'column' }}>
            <Typography variant="caption" sx={{ mb: 1, color: 'text.secondary' }}>
              Preview (CR80 Standard Size)
            </Typography>
            {/* ID Card Display */}
            <Box
              ref={idCardRef}
              sx={{
                width: '3.375in', // 85.6mm
                height: '2.125in', // 54mm
                backgroundColor: '#ffffff',
                border: '1px solid #ddd',
                borderRadius: '8px', // ~3mm
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                boxShadow: 3,
                p: 2,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Background styling line */}
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', bgcolor: 'primary.main' }} />

              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'primary.main', mb: 0.5 }}>
                  KYLLANG MEDICAL PORTAL
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '1rem', lineHeight: 1.1 }}>
                  {privateKeyDialog.name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.65rem' }}>
                  {privateKeyDialog.email}
                </Typography>
                <Chip
                  label={privateKeyDialog.role === 'doctor' ? 'Doctor' : 'Patient'}
                  size="small"
                  // color={privateKeyDialog.role === 'doctor' ? '#666' : '#666'}
                  color="#666"
                  sx={{ mt: 1, height: '20px', fontSize: '0.6rem' }}
                />
              </Box>
            </Box>
          </Box>

        </DialogContent>
        <DialogActions>
          <Button onClick={handleDownloadIDCard} startIcon={<DownloadIcon />} variant="contained" color="primary">
            Download ID Card
          </Button>
          <Button onClick={() => setPrivateKeyDialog({ ...privateKeyDialog, open: false })} variant="outlined">
            Done
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleIcon color="primary" /> User Management
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<PersonAddIcon />} 
          onClick={() => setModalOpen(true)}
          sx={{ fontWeight: 600 }}
        >
          Register New User
        </Button>
      </Box>

      <UserRegistrationModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onSuccess={handleRegistrationSuccess} 
      />



      <Grid container spacing={3}>
        {/* Patients List */}
        <Grid item xs={12} md={6}>
          <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon /> Patients ({patients.length})
                </Typography>
                <Chip label={`Total: ${patients.length}`} size="small" />
              </Box>

              <List sx={{ flexGrow: 1, maxHeight: 400, overflow: 'auto' }}>
                {patients.map((patient) => (
                  <ListItem
                    key={patient._id}
                    sx={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: 'white'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1">{patient.name}</Typography>
                          <Chip
                            label="Active"
                            size="small"
                            color="success"
                          />
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2">
                            {patient.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {patient._id}
                          </Typography>
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDelete('patient', patient._id, patient.name)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>

              {patients.length === 0 && (
                <Alert severity="info">
                  No patients found. Add a new patient using the form above.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Doctors List */}
        <Grid item xs={12} md={6}>
          <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MedicalServicesIcon /> Doctors ({doctors.length})
                </Typography>
                <Chip label={`Total: ${doctors.length}`} size="small" />
              </Box>

              <List sx={{ flexGrow: 1, maxHeight: 400, overflow: 'auto' }}>
                {doctors.map((doctor) => (
                  <ListItem
                    key={doctor._id}
                    sx={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: 'white'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1">{doctor.name}</Typography>
                          <Chip
                            label="Active"
                            size="small"
                            color="success"
                          />
                          <Chip label={doctor.specialty || 'General'} size="small" variant="outlined" />
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2">
                            {doctor.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {doctor._id}
                          </Typography>
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDelete('doctor', doctor._id, doctor.name)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>

              {doctors.length === 0 && (
                <Alert severity="info">
                  No doctors found. Add a new doctor using the form above.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Insurance Officers List */}
        <Grid item xs={12} md={6}>
          <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VerifiedUserIcon /> Insurance Officers ({insuranceOfficers.length})
                </Typography>
                <Chip label={`Total: ${insuranceOfficers.length}`} size="small" />
              </Box>

              <List sx={{ flexGrow: 1, maxHeight: 400, overflow: 'auto' }}>
                {insuranceOfficers.map((officer) => (
                  <ListItem
                    key={officer._id}
                    sx={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: 'white'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1">{officer.name}</Typography>
                          <Chip label="Active" size="small" color="success" />
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2">
                            {officer.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {officer._id}
                          </Typography>
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDelete('insurance_officer', officer._id, officer.name)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>

              {insuranceOfficers.length === 0 && (
                <Alert severity="info">
                  No insurance officers found. Register one via "Register New User" above.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Admins Section */}
      <Card elevation={2} sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VerifiedUserIcon /> System Administrators
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            Administrators have full system access. This section is for informational purposes only.
          </Alert>

          <Grid container spacing={2} alignItems="center">
            {admins.map((admin) => (
              <Grid item xs={12} md={6} key={admin.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle1">{admin.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {admin.email} • {admin.adminId}
                        </Typography>
                      </Box>
                      <Chip label="Admin" color="primary" size="small" />
                    </Box>
                    <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                      Permissions: {admin.permissions.join(', ')}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, type: '', id: null, name: '' })}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Are you sure you want to delete {deleteDialog.name}?
            {deleteDialog.type === 'doctor' && ' This will also unassign them from all patients.'}
          </Alert>
          <Typography variant="body2">
            This action cannot be undone. All associated data will be removed from the system.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, type: '', id: null, name: '' })}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
