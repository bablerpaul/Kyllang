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
  Tooltip
} from '@mui/material';
import {
  Person as PersonIcon,
  MedicalServices as MedicalServicesIcon,
  AccessTime as AccessTimeIcon,
  CalendarToday as CalendarIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [stats, setStats] = useState({
    totalPatients: 0,
    pendingRequests: 0,
    todaysAppointments: 3
  });

  const fetchPatients = async () => {
    try {
      const data = await apiFetch('/api/doctor/patients');
      setDoctorPatients(data);
      setFilteredPatients(data);

      setStats(prev => ({ ...prev, totalPatients: data.length }));
    } catch (err) {
      console.error("Failed to fetch doctor patients:", err);
    }
  };

  useEffect(() => {
    fetchPatients();

    // Load pending requests from localStorage (mock feature until api docs)
    const requests = JSON.parse(localStorage.getItem('doctor_access_requests') || '[]');
    const pending = requests.filter(req => req.status === 'pending');
    setPendingRequests(pending);

    // Calculate stats
    setStats(prev => ({
      ...prev,
      pendingRequests: pending.length,
    }));
  }, []);

  const handleRefresh = () => {
    // In real app, this would fetch fresh data
    alert('Refreshing data...');
  };

  return (
    <Box sx={{ p: { xs: 0, md: 0 } }}>
      {/* Header */}
      <div id="dashboard-top"></div>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ maxWidth: 720 }}>
            <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
              <MedicalServicesIcon /> Doctor Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Welcome, {user || 'Doctor'}. Manage your patients and access medical documents.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Tooltip title="Refresh">
              <IconButton onClick={handleRefresh}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
            >
              Filter
            </Button>
          </Box>
        </Box>
      </Paper>

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
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.totalPatients}</Typography>
                  <Typography variant="caption">My Patients</Typography>
                </Box>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(stats.totalPatients / systemStats.totalPatients) * 100}
                sx={{ height: 6, borderRadius: 999 }}
              />
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
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.pendingRequests}</Typography>
                  <Typography variant="caption">Pending Requests</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Awaiting patient approval
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
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.todaysAppointments}</Typography>
                  <Typography variant="caption">Today's Appointments</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Next: 2:00 PM
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>


    </Box>
  );
};

export default DoctorDashboard;