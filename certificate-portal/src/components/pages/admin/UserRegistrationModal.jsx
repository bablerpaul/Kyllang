import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Paper, Typography, Grid, TextField, InputAdornment, Button, CircularProgress, Alert, Divider, MenuItem, Chip, Select, FormControl, InputLabel
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import WcIcon from '@mui/icons-material/Wc';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import HomeIcon from '@mui/icons-material/Home';
import LockIcon from '@mui/icons-material/Lock';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import ShieldIcon from '@mui/icons-material/Shield';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import SecurityIcon from '@mui/icons-material/Security';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { apiFetch } from '../../../utils/api';

const EMPTY_FORM = {
  name: '',
  dateOfBirth: '',
  gender: '',
  email: '',
  password: '',
  contactNumber: '',
  address: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyPhone: '',
  bloodGroup: '',
  allergies: '',
  chronicConditions: '',
  insuranceProvider: '',
  policyNumber: '',
  specialty: 'General Physician',
  doctorContactNumber: '',
  doctorLicenseNumber: '',
  doctorDepartment: ''
};

export default function UserRegistrationModal({ open, onClose, onSuccess }) {
  const [role, setRole] = useState('general_user');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: role,
        specialty: role === 'doctor' ? form.specialty : undefined,
      };

      if (role === 'doctor') {
        payload.contactNumber = form.doctorContactNumber;
        payload.licenseNumber = form.doctorLicenseNumber;
        payload.department = form.doctorDepartment;
      } else if (role === 'general_user') {
        payload.dateOfBirth = form.dateOfBirth;
        payload.gender = form.gender;
        payload.contactNumber = form.contactNumber;
        payload.address = form.address;
        payload.emergencyName = form.emergencyName;
        payload.emergencyRelation = form.emergencyRelation;
        payload.emergencyPhone = form.emergencyPhone;
        payload.bloodGroup = form.bloodGroup;
        payload.allergies = form.allergies;
        payload.chronicConditions = form.chronicConditions;
        payload.insuranceProvider = form.insuranceProvider;
        payload.policyNumber = form.policyNumber;
      }

      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      const payloadData = res.data || res;
      onSuccess(payloadData, form, role);
      
      // Reset form
      setForm(EMPTY_FORM);
      setRole('general_user');
    } catch (err) {
      setError('Registration failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setRole('general_user');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PersonAddIcon color="primary" />
            Register New User
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Alert severity="info" sx={{ mb: 3, fontSize: '0.85rem' }}>
              A Curve25519 key pair will be generated automatically for the new user. The private key will be securely shown once upon successful registration via the Key Card dialog.
            </Alert>

            {/* Role Selection */}
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                <AdminPanelSettingsIcon color="primary" /> Account Role
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>User Role</InputLabel>
                    <Select
                      value={role}
                      label="User Role"
                      onChange={(e) => setRole(e.target.value)}
                      sx={{ bgcolor: 'background.paper' }}
                    >
                      <MenuItem value="general_user">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><PersonIcon fontSize="small" /> Patient</Box>
                      </MenuItem>
                      <MenuItem value="doctor">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><MedicalServicesIcon fontSize="small" /> Doctor</Box>
                      </MenuItem>
                      <MenuItem value="insurance_officer">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><SecurityIcon fontSize="small" /> Insurance Officer</Box>
                      </MenuItem>
                      <MenuItem value="hospital_admin">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AdminPanelSettingsIcon fontSize="small" /> Admin</Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>

            {/* General Fields for all roles except doctor */}
            {role !== 'doctor' && (
              <>
  {/* General Fields for all roles */}
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                <PersonIcon color="primary" /> {role === 'general_user' ? 'Patient Information' : 'Basic Information'}
              </Typography>
              <Grid container spacing={{ xs: 2, md: 3 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth label="Full Name" required size="small"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                    sx={{ bgcolor: 'background.paper' }}
                  />
                </Grid>



                {role === 'general_user' && (
                  <>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth label="Date of Birth" type="date" size="small" required
                        InputLabelProps={{ shrink: true }}
                        value={form.dateOfBirth}
                        onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth select label="Gender" size="small" required
                        value={form.gender}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><WcIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      >
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                        <MenuItem value="Prefer not to say">Prefer not to say</MenuItem>
                      </TextField>
                    </Grid>
                  </>
                )}
              </Grid>
            </Paper>

            {/* 2. Contact & Account Information */}
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: role === 'general_user' ? 3 : 0 }}>
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                <PhoneIcon color="primary" /> Contact & Account Settings
              </Typography>
              <Grid container spacing={{ xs: 2, md: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth label="Email Address" type="email" required size="small"
                    placeholder="user@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                    sx={{ bgcolor: 'background.paper' }}
                    error={form.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)}
                    helperText={form.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Please enter a valid email address' : ''}
                  />
                </Grid>
                {role === 'general_user' && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth label="Contact Number" size="small" required
                      placeholder="+1 (555) 000-0000"
                      value={form.contactNumber}
                      onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
                      InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                      sx={{ bgcolor: 'background.paper' }}
                    />
                  </Grid>
                )}
                {role === 'general_user' && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth label="Residential Address" size="small"
                      placeholder="123 Main St, City, State, Zip"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      InputProps={{ startAdornment: <InputAdornment position="start"><HomeIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                      sx={{ bgcolor: 'background.paper' }}
                    />
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth label="Initial Password" type="password" required size="small"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                    sx={{ bgcolor: 'background.paper' }}
                    error={form.password.length > 0 && form.password.length < 6}
                    helperText={form.password.length > 0 && form.password.length < 6 ? 'Password must be at least 6 characters' : 'User will use this for first login'}
                  />
                </Grid>
              </Grid>
            </Paper>
            </>
          )}

            {role === 'general_user' && (
              <>
                {/* 3. Emergency Contact */}
                <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                  <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                    <ContactEmergencyIcon color="error" /> Emergency Contact
                  </Typography>
                  <Grid container spacing={{ xs: 2, md: 3 }}>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth label="Primary Contact Name" size="small"
                        placeholder="Jane Doe"
                        value={form.emergencyName}
                        onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth label="Relationship to Patient" size="small"
                        placeholder="Spouse, Parent, etc."
                        value={form.emergencyRelation}
                        onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth label="Emergency Phone" size="small"
                        placeholder="+1 (555) 000-0000"
                        value={form.emergencyPhone}
                        onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {/* 4. Medical Information */}
                <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary' }}>
                      <LocalHospitalIcon color="primary" /> Medical Information
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4.5, display: 'block', mt: -0.5 }}>
                      Record essential clinical data for initial patient intake.
                    </Typography>
                  </Box>
                  <Grid container spacing={{ xs: 2, md: 3 }}>
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField
                        fullWidth select label="Blood Group" size="small" required
                        value={form.bloodGroup}
                        onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><BloodtypeIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      >
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map((bg) => (
                          <MenuItem key={bg} value={bg}>{bg}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12}>
                      <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth label="Known Allergies" size="small" multiline rows={2}
                        placeholder="E.g. Peanuts, Penicillin, Latex"
                        value={form.allergies}
                        onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                        helperText="Separate multiple allergies with commas"
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth label="Chronic Conditions" size="small" multiline rows={2}
                        placeholder="E.g. Asthma, Type 2 Diabetes, Hypertension"
                        value={form.chronicConditions}
                        onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })}
                        helperText="Separate multiple conditions with commas"
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {/* 5. Insurance Information */}
                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary' }}>
                      <HealthAndSafetyIcon color="success" /> Insurance Information
                    </Typography>
                    <Chip label="Optional" size="small" variant="outlined" sx={{ color: 'text.secondary', borderColor: 'divider' }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4.5, display: 'block', mb: 3, mt: -0.5 }}>
                    Provide primary health insurance coverage details for future billing and claims.
                  </Typography>
                  
                  <Grid container spacing={{ xs: 2, md: 3 }}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth label="Insurance Provider" size="small"
                        placeholder="E.g. Blue Cross Blue Shield, Aetna"
                        value={form.insuranceProvider}
                        onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><ShieldIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth label="Policy / Group Number" size="small"
                        placeholder="E.g. POL-123456789"
                        value={form.policyNumber}
                        onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start"><FactCheckIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                        sx={{ bgcolor: 'background.paper' }}
                      />
                    </Grid>
                  </Grid>
                </Paper>
              </>
            )}

            {/* DOCTOR WORKFLOW */}
            {role === 'doctor' && (
              <>
                 <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                      <PersonIcon color="primary" /> Professional Identity
                    </Typography>
                    <Grid container spacing={{ xs: 2, md: 3 }}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="Full Name" required size="small"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="Email Address" type="email" required size="small"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                          error={form.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)}
                          helperText={form.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Invalid email' : ''}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="Specialty" required size="small"
                          value={form.specialty}
                          onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><MedicalServicesIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="Contact Number" size="small"
                          value={form.doctorContactNumber}
                          onChange={(e) => setForm({ ...form, doctorContactNumber: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                          placeholder="+1 (555) 000-0000"
                        />
                      </Grid>
                    </Grid>
                 </Paper>

                 <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                      <FactCheckIcon color="primary" /> Medical Credentials
                    </Typography>
                    <Grid container spacing={{ xs: 2, md: 3 }}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="License / Registration Number" required size="small"
                          value={form.doctorLicenseNumber}
                          onChange={(e) => setForm({ ...form, doctorLicenseNumber: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><FactCheckIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                          placeholder="e.g. MD123456"
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth label="Department / Ward" size="small"
                          value={form.doctorDepartment}
                          onChange={(e) => setForm({ ...form, doctorDepartment: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><LocalHospitalIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                          placeholder="e.g. General Medicine"
                        />
                      </Grid>
                    </Grid>
                 </Paper>

                 <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: 'text.primary', mb: 3 }}>
                      <LockIcon color="primary" /> Account Security
                    </Typography>
                    <Grid container spacing={{ xs: 2, md: 3 }}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth label="Initial Password" type="password" required size="small"
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" sx={{ color: 'text.secondary' }}/></InputAdornment> }}
                          sx={{ bgcolor: 'background.paper' }}
                          error={form.password.length > 0 && form.password.length < 6}
                          helperText={form.password.length > 0 && form.password.length < 6 ? 'Password must be at least 6 characters' : 'User will use this for first login'}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Alert severity="info" sx={{ mt: 1, fontSize: '0.85rem' }}>
                          The system will generate a cryptographic Curve25519 key pair securely on the backend for this doctor. You will receive the Key Card containing their private key in the next step.
                        </Alert>
                      </Grid>
                    </Grid>
                 </Paper>
              </>
            )}
            {error && (
              <Alert severity="error" variant="filled" sx={{ mt: 3, fontSize: '0.85rem' }}>
                {error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end', gap: 1.5 }}>
          <Button 
            onClick={handleClose} 
            variant="outlined"
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || !form.name.trim() || !form.email.trim() || !form.password.trim()}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            sx={{ fontWeight: 600, px: 3 }}
          >
            {submitting ? 'Creating User…' : 'Create User'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
