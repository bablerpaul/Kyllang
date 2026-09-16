import React, { useState, useEffect, useMemo } from 'react';
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
  Grid,
  CircularProgress,
  Alert,
  Avatar,
  IconButton,
  Tooltip,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { apiFetch } from '../../utils/api';

export default function DoctorsManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/doctor/all');
      setDoctors(res.data || []);
    } catch (err) {
      console.error("Failed to fetch doctors:", err);
      setError(err.message || 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const uniqueSpecialties = useMemo(() => {
    const specs = new Set(doctors.map(d => d.specialty).filter(Boolean));
    return ['All', ...Array.from(specs).sort()];
  }, [doctors]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set(doctors.map(d => d.department).filter(Boolean));
    return ['All', ...Array.from(depts).sort()];
  }, [doctors]);

  const filtered = doctors.filter(d => {
    const searchString = searchTerm.toLowerCase();
    const matchesSearch = 
      (d.user?.name || '').toLowerCase().includes(searchString) || 
      (d.specialty || '').toLowerCase().includes(searchString) ||
      (d.licenseNumber || '').toLowerCase().includes(searchString) ||
      (d.department || '').toLowerCase().includes(searchString) ||
      (d.user?.email || '').toLowerCase().includes(searchString);
    
    const matchesSpecialty = filterSpecialty === 'All' || d.specialty === filterSpecialty;
    const matchesDepartment = filterDepartment === 'All' || d.department === filterDepartment;

    return matchesSearch && matchesSpecialty && matchesDepartment;
  });

  const getInitials = (name) => {
    if (!name) return 'DR';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Page Header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Doctor Roster
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b', mt: 0.5 }}>
            Manage and view registered medical professionals
          </Typography>
          {!loading && !error && (
            <Typography variant="subtitle2" sx={{ color: '#0284c7', mt: 1, fontWeight: 600 }}>
              {doctors.length} Registered Doctor{doctors.length !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchDoctors}
          disabled={loading}
          sx={{ borderColor: '#e2e8f0', color: '#475569', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' }, textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Refresh Roster
        </Button>
      </Box>

      {/* Filters and Search Bar */}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, border: '1px solid #e2e8f0', borderRadius: '12px', bgcolor: '#ffffff' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search doctors by name, email, specialty, or license..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="specialty-filter-label">Specialty</InputLabel>
              <Select
                labelId="specialty-filter-label"
                value={filterSpecialty}
                label="Specialty"
                onChange={(e) => setFilterSpecialty(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                {uniqueSpecialties.map(spec => (
                  <MenuItem key={spec} value={spec}>{spec}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="department-filter-label">Department</InputLabel>
              <Select
                labelId="department-filter-label"
                value={filterDepartment}
                label="Department"
                onChange={(e) => setFilterDepartment(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                {uniqueDepartments.map(dept => (
                  <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Doctor Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 900 }}>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: '#475569', py: 2 }}>Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#475569', py: 2 }}>Specialty</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#475569', py: 2 }}>Department</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#475569', py: 2 }}>License Number</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#475569', py: 2 }}>Consultation Fee</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: '#475569', py: 2 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={40} thickness={4} sx={{ color: '#0ea5e9' }} />
                  <Typography sx={{ mt: 2, color: '#64748b' }}>Loading doctor roster...</Typography>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                  <Alert severity="error" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    {error}
                  </Alert>
                  <Box mt={2}>
                    <Button onClick={fetchDoctors} variant="outlined" color="error">Retry Connection</Button>
                  </Box>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                  <Avatar sx={{ mx: 'auto', bgcolor: '#f1f5f9', color: '#94a3b8', width: 64, height: 64, mb: 2 }}>
                    <SearchIcon fontSize="large" />
                  </Avatar>
                  <Typography variant="h6" sx={{ color: '#334155', fontWeight: 600 }}>
                    {searchTerm || filterSpecialty !== 'All' || filterDepartment !== 'All' 
                      ? 'No doctors found matching your search.' 
                      : 'No doctors registered yet.'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>
                    {searchTerm || filterSpecialty !== 'All' || filterDepartment !== 'All'
                      ? 'Try adjusting your search criteria or clearing filters.'
                      : 'Register new doctors via the User Management panel.'}
                  </Typography>
                  {(searchTerm || filterSpecialty !== 'All' || filterDepartment !== 'All') && (
                    <Button 
                      variant="text" 
                      sx={{ mt: 2, textTransform: 'none' }}
                      onClick={() => { setSearchTerm(''); setFilterSpecialty('All'); setFilterDepartment('All'); }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((doctor) => {
                const docName = doctor.user?.name || 'Unknown Doctor';
                const docEmail = doctor.user?.email || 'No email provided';
                
                return (
                  <TableRow key={doctor._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: '#0284c7', fontWeight: 600, fontSize: '0.875rem' }}>
                          {getInitials(docName)}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                            {docName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                            {docEmail}
                          </Typography>
                          <Chip label="Doctor" size="small" sx={{ height: 18, fontSize: '0.65rem', mt: 0.5, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }} />
                        </Box>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Chip 
                        label={doctor.specialty || 'N/A'} 
                        size="small" 
                        sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600, borderRadius: '6px' }} 
                      />
                    </TableCell>
                    
                    <TableCell sx={{ color: '#334155', fontWeight: 500 }}>
                      {doctor.department || 'N/A'}
                    </TableCell>
                    
                    <TableCell sx={{ fontFamily: 'monospace', color: '#475569', fontWeight: 500 }}>
                      {doctor.licenseNumber || 'N/A'}
                    </TableCell>
                    
                    <TableCell sx={{ fontWeight: 600, color: '#16a34a' }}>
                      {doctor.consultationFee !== undefined && doctor.consultationFee !== null ? `$${doctor.consultationFee}` : 'N/A'}
                    </TableCell>
                    
                    <TableCell align="right">
                      <Tooltip title="View Profile">
                        <IconButton size="small" sx={{ color: '#94a3b8', '&:hover': { color: '#0ea5e9', bgcolor: '#f0f9ff' } }}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
