import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Tab,
  Tabs,
  Card,
  CardContent,
  Button,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Dashboard,
  AddCircle,
  CheckCircle,
  History,
  Notifications,
  Security,
  Help,
  Description
} from '@mui/icons-material';
import GenerateCertificate from './GenerateCertificate';
import ApproveRequests from './ApproveRequests';
import CertificateViewerDialog from './CertificateViewerDialog';
import MyDocuments from './MyDocuments';
import { apiFetch } from '../../../utils/api';

const UserDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [certificates, setCertificates] = useState([]);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [certificateViewerOpen, setCertificateViewerOpen] = useState(false);
  const [stats, setStats] = useState({
    generatedCertificates: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    doctorsAccessed: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam !== null) {
      setActiveTab(parseInt(tabParam, 10));
    }
  }, [window.location.search]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const docs = await apiFetch('/api/patient/documents');
        const certs = await apiFetch('/api/patient/certificates');

        let pending = 0;
        let approved = 0;
        const mappedDoctors = new Set();
        const activity = [];

        docs.forEach(doc => {
          pending += (doc.accessRequests?.length || 0);

          if (doc.accessList) {
            approved += doc.accessList.length;
            doc.accessList.forEach(a => {
              if (a.doctor?._id) mappedDoctors.add(a.doctor._id.toString());
              activity.push({
                id: `app-${a._id}`,
                action: `Approved Dr. ${a.doctor?.name}'s request`,
                time: new Date(a.expiresAt || Date.now()).toLocaleDateString(),
                type: 'approve',
                date: new Date(a.expiresAt || Date.now())
              });
            });
          }
        });

        certs.forEach(c => {
          activity.push({
            id: `cert-${c._id}`,
            action: `Received ${c.diagnosis} Certificate`,
            time: new Date(c.createdAt || Date.now()).toLocaleDateString(),
            type: 'generate',
            date: new Date(c.createdAt || Date.now())
          });
        });

        activity.sort((a, b) => b.date - a.date);

        setStats({
          generatedCertificates: certs.length,
          pendingRequests: pending,
          approvedRequests: approved,
          doctorsAccessed: mappedDoctors.size
        });
        setRecentActivity(activity.slice(0, 5));
        setCertificates(certs);
      } catch (err) {
        console.error("Failed to fetch user dashboard data", err);
      }
    };
    fetchDashboardData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Welcome Header */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Dashboard /> User Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage your medical certificates and control access for healthcare providers
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Help />}
            onClick={() => alert('Help: You can generate certificates and approve/deny doctor access requests.')}
          >
            Help
          </Button>
        </Box>
      </Paper>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="primary.main">
                {stats.generatedCertificates}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Certificates Generated
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="warning.main">
                {stats.pendingRequests}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pending Requests
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="success.main">
                {stats.approvedRequests}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Approved Requests
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="info.main">
                {stats.doctorsAccessed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Doctors Accessed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Content with Tabs */}
      <Paper elevation={3} sx={{ mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<AddCircle />}
            label="Generate Certificates"
            iconPosition="start"
          />
          <Tab
            icon={<CheckCircle />}
            label="Approve Requests"
            iconPosition="start"
          />
          <Tab
            icon={<Security />}
            label="Access Control"
            iconPosition="start"
          />
          <Tab
            icon={<Description />}
            label="My Documents"
            iconPosition="start"
          />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {activeTab === 0 && <GenerateCertificate />}
          {activeTab === 1 && <ApproveRequests />}
          {activeTab === 3 && <MyDocuments />}
          {activeTab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Access Control Settings
              </Typography>
              <Alert severity="info" sx={{ mb: 3 }}>
                Configure your privacy settings and access permissions for healthcare providers.
              </Alert>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Default Access Settings
                      </Typography>
                      <List>
                        <ListItem>
                          <ListItemIcon>
                            <Security />
                          </ListItemIcon>
                          <ListItemText
                            primary="Auto-approve trusted doctors"
                            secondary="Automatically approve requests from doctors you've previously approved"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon>
                            <Notifications />
                          </ListItemIcon>
                          <ListItemText
                            primary="Request notifications"
                            secondary="Get email notifications for new access requests"
                          />
                        </ListItem>
                      </List>
                      <Button variant="outlined" sx={{ mt: 2 }}>
                        Configure Settings
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Recent Activity
                      </Typography>
                      <List dense>
                        {recentActivity.map((activity) => (
                          <ListItem key={activity.id}>
                            <ListItemText
                              primary={activity.action}
                              secondary={activity.time}
                            />
                            {activity.type === 'generate' && (
                              <Button
                                size="small"
                                color="primary"
                                onClick={() => {
                                  const cert = certificates.find(c => `cert-${c._id}` === activity.id);
                                  if (cert) {
                                    setSelectedCertificate(cert);
                                    setCertificateViewerOpen(true);
                                  }
                                }}
                                sx={{ mr: 1 }}
                              >
                                View / PDF
                              </Button>
                            )}
                            <ListItemIcon>
                              <Box sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor:
                                  activity.type === 'generate' ? '#2196f3' :
                                    activity.type === 'approve' ? '#4caf50' : '#f44336'
                              }} />
                            </ListItemIcon>
                          </ListItem>
                        ))}
                      </List>
                      <Button variant="outlined" sx={{ mt: 2 }}>
                        View Full History
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Paper>


      {/* Important Notice */}
      <Alert
        severity="info"
        sx={{ mt: 4 }}
        icon={<Security />}
      >
        <Typography variant="subtitle2">
          Security Notice
        </Typography>
        <Typography variant="body2">
          • Only approve access requests from verified doctors you trust<br />
          • Review each request's purpose before approving<br />
          • You can revoke access at any time from the Access Control tab<br />
          • All access is logged for your security and audit purposes
        </Typography>
      </Alert>

      <CertificateViewerDialog
        open={certificateViewerOpen}
        onClose={() => setCertificateViewerOpen(false)}
        certificate={selectedCertificate}
      />
    </Box>
  );
};

export default UserDashboard;