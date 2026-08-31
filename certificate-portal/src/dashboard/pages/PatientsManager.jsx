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
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Avatar,
  Skeleton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import { apiFetch } from '../../utils/api';

const EMPTY_FORM = { name: '', email: '', password: '', phone: '' };

export default function PatientsManager() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [pkDialog, setPkDialog] = useState(false);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/users');
      const all = res?.data || res || [];
      // Filter to general_user role only
      setPatients(all.filter(u => u.role === 'general_user'));
    } catch (err) {
      setError('Failed to load patients: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: 'general_user',
        }),
      });
      // If the backend returned a private key for the new user, show it
      const pk = res?.data?.privateKey || res?.privateKey;
      if (pk) {
        setPrivateKey(pk);
        setPkDialog(true);
      } else {
        setSuccessMsg(`Patient "${form.name}" registered successfully.`);
        setTimeout(() => setSuccessMsg(''), 5000);
      }
      setForm(EMPTY_FORM);
      setOpenDialog(false);
      await fetchPatients(); // Refresh the list
    } catch (err) {
      setError('Registration failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = patients.filter(
    p =>
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Patients Directory
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {loading ? 'Loading…' : `${patients.length} registered patient${patients.length !== 1 ? 's' : ''} in the system`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchPatients} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => { setOpenDialog(true); setError(''); }}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
          >
            Register New Patient
          </Button>
        </Box>
      </Box>

      {/* Success / error banners */}
      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search patients by name or email…"
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

      {/* Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Public Key</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Registered</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Skeleton rows while loading
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j}><Skeleton variant="text" width="80%" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  {searchTerm ? 'No patients match your search.' : 'No patients registered yet. Click "Register New Patient" to add one.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((patient) => (
                <TableRow key={patient._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8rem', fontWeight: 700 }}>
                        {patient.name?.charAt(0)?.toUpperCase() || 'P'}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{patient.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          ID: {patient._id?.slice(-6)?.toUpperCase()}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#475569' }}>{patient.email}</TableCell>
                  <TableCell>
                    {patient.publicKey ? (
                      <Chip
                        label="Key Present ✓"
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="No Key"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {patient.createdAt
                      ? new Date(patient.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Register Patient Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); setForm(EMPTY_FORM); }} maxWidth="sm" fullWidth>
        <form onSubmit={handleRegister}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonAddIcon color="primary" />
              Register New Patient
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
              A Curve25519 key pair will be generated automatically. The private key is shown once — give it to the patient securely.
            </Alert>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth label="Full Name" required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon fontSize="small" /></InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth label="Email Address" type="email" required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth label="Initial Password" type="password" required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  helperText="Patient can change this after first login."
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button onClick={() => { setOpenDialog(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} /> : <PersonAddIcon />}
            >
              {submitting ? 'Registering…' : 'Register Patient'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Private Key One-Time Dialog */}
      <Dialog open={pkDialog} onClose={() => { setPkDialog(false); setPrivateKey(''); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'warning.dark' }}>⚠️ Save This Private Key Now</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This private key will <strong>never be shown again</strong>. Copy it and hand it to the patient securely.
          </Alert>
          <TextField
            fullWidth
            multiline
            rows={4}
            value={privateKey}
            InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => { navigator.clipboard.writeText(privateKey); }}
          >
            Copy to Clipboard
          </Button>
          <Button
            variant="outlined"
            onClick={() => { setPkDialog(false); setPrivateKey(''); setSuccessMsg('Patient registered. Private key saved.'); }}
          >
            Done — I Saved It
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
