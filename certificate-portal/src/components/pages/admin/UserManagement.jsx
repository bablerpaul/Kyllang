import { useState, useEffect } from 'react';
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
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [newUserType, setNewUserType] = useState('general_user');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserParams, setNewUserParams] = useState('');

  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: null, name: '' });
  const [privateKeyDialog, setPrivateKeyDialog] = useState({ open: false, key: '', email: '' });

  const fetchUsers = async () => {
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      alert('Please enter a name, email, and password.');
      return;
    }

    try {
      const payload = {
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserType,
        specialty: newUserType === 'doctor' ? newUserParams || 'General Physician' : undefined,
      };

      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Show the private key to the admin to give to the user
      setPrivateKeyDialog({ open: true, key: res.privateKey, email: res.user.email });

      // Reset form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserParams('');

      fetchUsers();
    } catch (error) {
      alert(`Error adding user: ${error.message}`);
    }
  };

  const handleDelete = (type, id, name) => {
    // Delete not fully implemented in backend yet for PoC, just show UI
    alert('Delete functionality is not implemented for this Proof of Concept.');
  };

  const confirmDelete = () => {
    setDeleteDialog({ open: false, type: '', id: null, name: '' });
  };

  const patients = users.filter(u => u.role === 'general_user');
  const doctors = users.filter(u => u.role === 'doctor');
  const admins = []; // Hide admins for now in UI

  return (
    <Box>
      <Dialog open={privateKeyDialog.open} onClose={() => setPrivateKeyDialog({ ...privateKeyDialog, open: false })}>
        <DialogTitle>User Created - Important Private Key</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            A new RSA Key Pair was generated for {privateKeyDialog.email}.
            The Public Key is stored securely. **You must copy the Private Key below and give it to the user.**
            It will NEVER be shown again!
          </Alert>
          <TextField
            multiline
            rows={6}
            fullWidth
            value={privateKeyDialog.key}
            InputProps={{ readOnly: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigator.clipboard.writeText(privateKeyDialog.key)} startIcon={<ContentCopyIcon />}>
            Copy
          </Button>
          <Button onClick={() => setPrivateKeyDialog({ ...privateKeyDialog, open: false })} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PeopleIcon /> User Management
      </Typography>

      {/* Add User Form */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Add New User
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>User Type</InputLabel>
                <Select
                  value={newUserType}
                  label="User Type"
                  onChange={(e) => setNewUserType(e.target.value)}
                >
                  <MenuItem value="general_user">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon fontSize="small" /> Patient
                    </Box>
                  </MenuItem>
                  <MenuItem value="doctor">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MedicalServicesIcon fontSize="small" /> Doctor
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Full Name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Enter full name"
              />
            </Grid>

            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </Grid>

            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="secret123"
              />
            </Grid>

            {newUserType === 'doctor' && (
              <Grid item xs={12} md={2}>
                <TextField
                  fullWidth
                  label="Specialty"
                  value={newUserParams}
                  onChange={(e) => setNewUserParams(e.target.value)}
                  placeholder="Cardiology"
                />
              </Grid>
            )}

            <Grid item xs={12} md={newUserType === 'doctor' ? 2 : 4}>
              <Button
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
                onClick={handleAddUser}
                sx={{ height: '56px' }}
              >
                Add {newUserType === 'general_user' ? 'Patient' : 'Doctor'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Patients List */}
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon /> Patients ({patients.length})
                </Typography>
                <Chip label={`Total: ${patients.length}`} size="small" />
              </Box>

              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
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
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MedicalServicesIcon /> Doctors ({doctors.length})
                </Typography>
                <Chip label={`Total: ${doctors.length}`} size="small" />
              </Box>

              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
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

          <Grid container spacing={2}>
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