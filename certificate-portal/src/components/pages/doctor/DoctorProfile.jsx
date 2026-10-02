import { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Paper,
    Alert,
    CircularProgress,
    Avatar,
} from '@mui/material';
import {
    Person as PersonIcon,
    Email as EmailIcon,
    Phone as PhoneIcon,
    LocalHospital as HospitalIcon,
    AssignmentInd as LicenseIcon,
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import DoctorKeyEnrollment from './DoctorKeyEnrollment';

const DoctorProfile = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchProfile = async () => {
        try {
            const res = await apiFetch('/api/doctor/me');
            const data = res?.doctor || res?.data?.doctor || res;
            setProfile(data);
            setError('');
        } catch (err) {
            console.error('Error fetching profile:', err);
            setError(err.message || 'Failed to load your profile.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    if (loading) {
        return (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 2, md: 4 } }}>
            <Typography variant="h4" fontWeight="700" gutterBottom sx={{ mb: 4, color: 'primary.main' }}>
                My Profile
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={4}>
                {/* Left Side: Summary Card */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', position: 'relative', overflow: 'visible' }}>
                        <CardContent sx={{ pt: 5, pb: 4, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <Avatar
                                sx={{
                                    width: 120,
                                    height: 120,
                                    bgcolor: 'primary.main',
                                    fontSize: '3rem',
                                    fontWeight: 700,
                                    mb: 2,
                                    border: '4px solid white',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}
                            >
                                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'D'}
                            </Avatar>
                            <Typography variant="h5" fontWeight="700" gutterBottom>
                                {profile?.name?.toLowerCase().includes('dr') || profile?.name?.toLowerCase().includes('dr.') 
                                    ? profile?.name 
                                    : `Dr. ${profile?.name || 'Unknown'}`}
                            </Typography>
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600, mb: 0.5, bgcolor: 'primary.50', px: 2, py: 0.5, borderRadius: 10 }}>
                                {profile?.specialty || 'General Practitioner'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {profile?.department || 'Medical Department'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Right Side: Details Form/View */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', height: '100%' }}>
                        <Typography variant="h6" fontWeight="700" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2, mb: 3 }}>
                            Personal Details
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Doctor ID
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PersonIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500, userSelect: 'all' }}>
                                            {profile?.id || profile?._id || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Medical License Number
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <LicenseIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {profile?.licenseNumber || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Email Address
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <EmailIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {profile?.email || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Contact Number
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PhoneIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {profile?.contactNumber || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            
                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Specialty
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <HospitalIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {profile?.specialty || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Department
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <HospitalIcon color="action" fontSize="small" />
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {profile?.department || '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>

            <Box sx={{ mt: 4 }}>
                <DoctorKeyEnrollment />
            </Box>
        </Box>
    );
};

export default DoctorProfile;
