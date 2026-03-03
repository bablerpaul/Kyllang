import { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Tab,
  Tabs,
  Divider,
  Button,
  Alert,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Assignment as AssignmentIcon,
  Upload as UploadIcon,
  Analytics as AnalyticsIcon,
  Security as SecurityIcon,
  VerifiedUser as VerifiedUserIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import UserManagement from './UserManagement';
import DoctorAssignment from './DoctorAssignment';
import DocumentUpload from './DocumentUpload';
import BlockchainAnchor from './BlockchainAnchor';
import SystemAnalytics from './SystemAnalytics';
import { useData } from '../../../contexts/DataContext';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const { systemStats } = useData();

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const tabs = [
    { label: 'Overview', icon: <DashboardIcon /> },
    { label: 'User Management', icon: <PeopleIcon /> },
    { label: 'Doctor Assignment', icon: <AssignmentIcon /> },
    { label: 'Document Upload', icon: <UploadIcon /> },
    { label: 'Blockchain Anchor', icon: <LinkIcon /> }
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f5f7fa', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon /> Hospital Admin Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage users, assign doctors, upload documents, and monitor system analytics
            </Typography>
          </Box>
          <Chip
            icon={<VerifiedUserIcon />}
            label="Administrator"
            color="primary"
            variant="outlined"
          />
        </Box>
      </Paper>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PeopleIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{systemStats.totalPatients}</Typography>
                  <Typography variant="caption">Total Patients</Typography>
                </Box>
              </Box>
              <LinearProgress
                variant="determinate"
                value={100}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AssignmentIcon sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{systemStats.totalDoctors}</Typography>
                  <Typography variant="caption">Active Doctors</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Licensed physicians
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <UploadIcon sx={{ fontSize: 40, color: 'warning.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{systemStats.totalCertificates}</Typography>
                  <Typography variant="caption">Documents</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Medical certificates
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AnalyticsIcon sx={{ fontSize: 40, color: 'info.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{systemStats.activeAppointments}</Typography>
                  <Typography variant="caption">Today's Appointments</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Scheduled today
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Content with Tabs */}
      <Card elevation={3}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              icon={tab.icon}
              label={tab.label}
              iconPosition="start"
              sx={{ minHeight: 64 }}
            />
          ))}
        </Tabs>

        <Box sx={{ p: 3 }}>
          {activeTab === 0 && (
            <Box>
              <Typography variant="h5" gutterBottom>
                System Overview
              </Typography>
              <Alert severity="info" sx={{ mb: 3 }}>
                Welcome to the Hospital Admin Portal. Use the tabs above to manage different aspects of the system.
              </Alert>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Quick Actions
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Button
                            variant="contained"
                            fullWidth
                            startIcon={<PeopleIcon />}
                            onClick={() => setActiveTab(1)}
                          >
                            Add User
                          </Button>
                        </Grid>
                        <Grid item xs={6}>
                          <Button
                            variant="outlined"
                            fullWidth
                            startIcon={<AssignmentIcon />}
                            onClick={() => setActiveTab(2)}
                          >
                            Assign Doctor
                          </Button>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>

              </Grid>

              <Alert severity="warning" sx={{ mt: 3 }}>
                <Typography variant="body2">
                  <strong>Important:</strong> All administrative actions are logged.
                  Please ensure compliance with healthcare regulations and patient privacy laws.
                </Typography>
              </Alert>
            </Box>
          )}

          {activeTab === 1 && <UserManagement />}
          {activeTab === 2 && <DoctorAssignment />}
          {activeTab === 3 && <DocumentUpload />}
          {activeTab === 4 && <BlockchainAnchor />}
        </Box>
      </Card>
    </Box>
  );
};

export default AdminDashboard;