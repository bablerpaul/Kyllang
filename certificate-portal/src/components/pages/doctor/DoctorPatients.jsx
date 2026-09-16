import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Card, CardContent, TextField, InputAdornment,
    List, ListItem, ListItemAvatar, ListItemText, Avatar, Chip, Button, Alert, Paper,
    CircularProgress, Grid, IconButton, Tooltip, Skeleton, Divider
} from '@mui/material';
import {
    Search as SearchIcon, Assignment as AssignmentIcon, People as PeopleIcon,
    Refresh as RefreshIcon, FilterList as FilterListIcon,
    Email as EmailIcon, Cake as CakeIcon, Bloodtype as BloodtypeIcon,
    Wc as WcIcon, WarningAmber as WarningAmberIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../utils/api';

const DoctorPatients = () => {
    const navigate = useNavigate();
    const [doctorPatients, setDoctorPatients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPatients, setFilteredPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchPatients = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiFetch('/api/doctor/patients');
            const patientsArray = Array.isArray(response?.data) ? response.data : [];
            setDoctorPatients(patientsArray);
            
            // Re-apply existing search filter if any
            if (searchQuery.trim()) {
                applySearch(searchQuery, patientsArray);
            } else {
                setFilteredPatients(patientsArray);
            }
        } catch (err) {
            console.error("Failed to fetch doctor patients:", err);
            setError(err.message || 'Unable to load patients.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applySearch = (query, patients) => {
        const lowerQuery = query.toLowerCase();
        const filtered = patients.filter(patient =>
            patient.name?.toLowerCase().includes(lowerQuery) ||
            patient.email?.toLowerCase().includes(lowerQuery) ||
            patient._id?.toLowerCase().includes(lowerQuery)
        );
        setFilteredPatients(filtered);
    };

    const handleSearch = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (!query.trim()) {
            setFilteredPatients(doctorPatients);
            return;
        }
        applySearch(query, doctorPatients);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setFilteredPatients(doctorPatients);
    };

    const handleViewPatient = (patientId) => {
        navigate(`/dashboard/patient/${patientId}`);
    };

    const getPatientAvatarColor = (patientId) => {
        const colors = ['primary', 'secondary', 'success', 'warning', 'info'];
        let hash = 0;
        for (let i = 0; i < String(patientId).length; i++) {
            hash = String(patientId).charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const calculateAge = (dob) => {
        if (!dob) return null;
        const diff = Date.now() - new Date(dob).getTime();
        const age = new Date(diff).getUTCFullYear() - 1970;
        return age >= 0 ? age : null;
    };

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            {/* Page Header */}
            <Paper sx={{ p: 3, mb: 4, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PeopleIcon fontSize="large" color="primary" /> My Patients
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage and review your authorized patient list.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder="Search by name, email, ID..."
                        value={searchQuery}
                        onChange={handleSearch}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon color="action" />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ minWidth: { xs: '100%', sm: 300 } }}
                    />
                    <Tooltip title="Refresh List">
                        <IconButton onClick={fetchPatients} color="primary" disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Paper>

            {/* Main Content Area */}
            {loading ? (
                <Grid container spacing={3}>
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                        <Grid item xs={12} sm={6} md={4} key={item}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        <Skeleton variant="circular" width={50} height={50} sx={{ mr: 2 }} />
                                        <Box sx={{ width: '100%' }}>
                                            <Skeleton variant="text" width="60%" height={30} />
                                            <Skeleton variant="text" width="40%" />
                                        </Box>
                                    </Box>
                                    <Skeleton variant="text" width="80%" />
                                    <Skeleton variant="text" width="70%" />
                                    <Skeleton variant="rectangular" height={36} sx={{ mt: 2, borderRadius: 1 }} />
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            ) : error ? (
                <Alert severity="error" action={
                    <Button color="inherit" size="small" onClick={fetchPatients}>
                        Retry
                    </Button>
                }>
                    {error}
                </Alert>
            ) : doctorPatients.length === 0 ? (
                <Alert severity="info" sx={{ p: 3, fontSize: '1.1rem' }}>
                    No patients are currently assigned or authorized for your account.
                </Alert>
            ) : filteredPatients.length === 0 ? (
                <Alert 
                    severity="warning" 
                    action={<Button color="inherit" size="small" onClick={handleClearSearch}>Clear Search</Button>}
                >
                    No patients match your search.
                </Alert>
            ) : (
                <Grid container spacing={3}>
                    {filteredPatients.map((patient) => {
                        const age = calculateAge(patient.dateOfBirth);
                        return (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={patient._id}>
                                <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 } }}>
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                                            <Avatar sx={{ bgcolor: `${getPatientAvatarColor(patient._id)}.main`, width: 56, height: 56, mr: 2, fontSize: '1.5rem' }}>
                                                {patient.name?.charAt(0)?.toUpperCase() || 'P'}
                                            </Avatar>
                                            <Box sx={{ overflow: 'hidden' }}>
                                                <Typography variant="h6" noWrap title={patient.name}>
                                                    {patient.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} noWrap>
                                                    <AssignmentIcon fontSize="inherit" /> {patient._id?.substring?.(18) || patient._id}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        <Divider sx={{ my: 1.5 }} />

                                        <List disablePadding dense>
                                            <ListItem disablePadding sx={{ mb: 1 }}>
                                                <EmailIcon color="action" fontSize="small" sx={{ mr: 1 }} />
                                                <ListItemText primary={patient.email} primaryTypographyProps={{ variant: 'body2', noWrap: true, title: patient.email }} />
                                            </ListItem>
                                            
                                            {(age !== null || patient.gender) && (
                                                <ListItem disablePadding sx={{ mb: 1 }}>
                                                    {patient.gender ? <WcIcon color="action" fontSize="small" sx={{ mr: 1 }} /> : <CakeIcon color="action" fontSize="small" sx={{ mr: 1 }} />}
                                                    <ListItemText 
                                                        primary={`${age !== null ? `${age} years` : ''}${age !== null && patient.gender ? ', ' : ''}${patient.gender || ''}`} 
                                                        primaryTypographyProps={{ variant: 'body2' }} 
                                                    />
                                                </ListItem>
                                            )}

                                            {patient.bloodGroup && (
                                                <ListItem disablePadding sx={{ mb: 1 }}>
                                                    <BloodtypeIcon color="action" fontSize="small" sx={{ mr: 1 }} />
                                                    <ListItemText primary={`Blood Group: ${patient.bloodGroup}`} primaryTypographyProps={{ variant: 'body2' }} />
                                                </ListItem>
                                            )}
                                        </List>

                                        {patient.allergies && patient.allergies.length > 0 && (
                                            <Box sx={{ mt: 2 }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                    <WarningAmberIcon fontSize="inherit" color="error" /> Allergies
                                                </Typography>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {patient.allergies.slice(0, 2).map((allergy, idx) => (
                                                        <Chip key={idx} label={allergy} size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                    ))}
                                                    {patient.allergies.length > 2 && (
                                                        <Chip label={`+${patient.allergies.length - 2}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                    )}
                                                </Box>
                                            </Box>
                                        )}
                                    </CardContent>
                                    <Box sx={{ p: 2, pt: 0 }}>
                                        <Button 
                                            variant="contained" 
                                            fullWidth 
                                            onClick={() => handleViewPatient(patient._id)}
                                            disableElevation
                                        >
                                            View Patient
                                        </Button>
                                    </Box>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Box>
    );
};

export default DoctorPatients;
