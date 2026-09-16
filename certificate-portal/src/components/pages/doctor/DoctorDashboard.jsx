import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Avatar,
  LinearProgress,
  Paper,
  IconButton,
  Tooltip,
  Skeleton
} from '@mui/material';
import {
  Person as PersonIcon,
  MedicalServices as MedicalServicesIcon,
  AccessTime as AccessTimeIcon,
  CalendarToday as CalendarIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocalHospital as HospitalIcon,
  AssignmentInd as LicenseIcon
} from '@mui/icons-material';
import { useAuth } from '../../../contexts/AuthContext';
import { useData } from '../../../contexts/DataContext';
import { apiFetch } from '../../../utils/api';
import CertificateRequests from './CertificateRequests';

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { patients, systemStats } = useData();

  const [doctorPatients, setDoctorPatients] = useState([]);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [stats, setStats] = useState({
    totalPatients: 0,
    pendingRequests: 0,
    todaysAppointments: 0,
    nextAppointment: 'No upcoming appointments'
  });

  const fetchData = async () => {
    setProfileLoading(true);
    try {
      const results = await Promise.allSettled([
        apiFetch('/api/doctor/patients'),
        apiFetch('/api/doctor/certificate-requests'),
        apiFetch('/api/doctor/me'),
        apiFetch('/api/appointments')
      ]);

      const [pRes, rRes, profileRes, aptRes] = results;

      // 1. Patients
      let totalPatients = 0;
      if (pRes.status === 'fulfilled') {
        const pData = pRes.value;
        const pList = pData.assignedPatients || pData.data || pData || [];
        const validPList = Array.isArray(pList) ? pList : [];
        setDoctorPatients(validPList);
        setFilteredPatients(validPList);
        totalPatients = validPList.length;
      }

      // 2. Requests
      let pendingCount = 0;
      if (rRes.status === 'fulfilled') {
        const rData = rRes.value;
        const rList = rData.data || rData || [];
        const pending = Array.isArray(rList) ? rList.filter(req => req.status === 'pending') : [];
        setPendingRequests(pending);
        pendingCount = pending.length;
      }

      // 3. Profile
      if (profileRes.status === 'fulfilled') {
        if (profileRes.value && profileRes.value.doctor) {
          setDoctorProfile(profileRes.value.doctor);
        }
      }

      // 4. Appointments
      let todaysAppointments = 'Unable to load';
      let nextAppointment = 'No upcoming appointments';
      
      if (aptRes.status === 'fulfilled') {
        const aData = aptRes.value;
        const aList = aData.data || aData || [];
        const validAList = Array.isArray(aList) ? aList : [];
        
        const activeApts = validAList.filter(a => a.status === 'scheduled');
        
        const todayStr = new Date().toDateString();
        const todayApts = activeApts.filter(a => new Date(a.appointmentDate).toDateString() === todayStr);
        todaysAppointments = todayApts.length;
        
        const now = new Date();
        const upcomingApts = activeApts
          .filter(a => new Date(a.appointmentDate) >= now)
          .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
        
        if (upcomingApts.length > 0) {
          const nextApt = upcomingApts[0];
          const timeString = new Date(nextApt.appointmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const pName = nextApt.patient?.name ? ` - ${nextApt.patient.name}` : '';
          nextAppointment = `Next: ${timeString}${pName}`;
        }
      }

      setStats({
        totalPatients,
        pendingRequests: pendingCount,
        todaysAppointments,
        nextAppointment
      });

    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    // In real app, this would fetch fresh data
    alert('Refreshing data...');
  };

  return (
    <Box sx={{ p: { xs: 0, md: 0 } }}>
      {/* Header */}
      <div id="dashboard-top"></div>
      
      {profileLoading ? (
        <LinearProgress sx={{ mb: 4 }} />
      ) : doctorProfile ? (
        <Card sx={{ mb: 4, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          <CardContent sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 4, flexDirection: { xs: 'column', md: 'row' } }}>
            <Avatar 
              sx={{ width: 90, height: 90, bgcolor: 'primary.main', fontSize: '2.5rem', fontWeight: 600 }}
            >
              {doctorProfile.name ? doctorProfile.name.charAt(0).toUpperCase() : 'D'}
            </Avatar>
            <Box sx={{ flex: 1, textAlign: { xs: 'center', md: 'left' } }}>
              <Typography variant="h4" fontWeight="700" gutterBottom>
                {doctorProfile.name?.toLowerCase().includes('dr') || doctorProfile.name?.toLowerCase().includes('dr.') 
                  ? doctorProfile.name 
                  : `Dr. ${doctorProfile.name}`}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 2, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HospitalIcon color="action" fontSize="small" />
                  <Typography variant="body1" color="text.secondary">
                    <strong>Specialty:</strong> {doctorProfile.specialty} • {doctorProfile.department}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LicenseIcon color="action" fontSize="small" />
                  <Typography variant="body1" color="text.secondary">
                    <strong>License:</strong> {doctorProfile.licenseNumber}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon color="action" fontSize="small" />
                  <Typography variant="body1" color="text.secondary">
                    {doctorProfile.email}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon color="action" fontSize="small" />
                  <Typography variant="body1" color="text.secondary">
                    {doctorProfile.contactNumber}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 150 }}>
              <Button 
                variant="outlined" 
                color="primary" 
                fullWidth 
                startIcon={<RefreshIcon />} 
                onClick={() => { fetchData(); }}
              >
                Refresh Data
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Paper sx={{ p: 3, mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <MedicalServicesIcon color="error" />
          <Typography variant="h6" color="error">Doctor profile not found or unavailable.</Typography>
        </Paper>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }} alignItems="stretch">
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ minHeight: 148 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <PersonIcon />
                </Avatar>
                <Box>
                  {profileLoading ? (
                    <Skeleton width={60} height={40} />
                  ) : (
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.totalPatients}</Typography>
                  )}
                  <Typography variant="caption">Total Patients</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Assigned to you
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ minHeight: 148 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <AccessTimeIcon />
                </Avatar>
                <Box>
                  {profileLoading ? (
                    <Skeleton width={60} height={40} />
                  ) : (
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.pendingRequests}</Typography>
                  )}
                  <Typography variant="caption">Pending Requests</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Requires your review
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ minHeight: 148 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                  <CalendarIcon />
                </Avatar>
                <Box>
                  {profileLoading ? (
                    <Skeleton width={60} height={40} />
                  ) : (
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.todaysAppointments}</Typography>
                  )}
                  <Typography variant="caption">Appointments Today</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {stats.nextAppointment}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>


    </Box>
  );
};

export default DoctorDashboard;