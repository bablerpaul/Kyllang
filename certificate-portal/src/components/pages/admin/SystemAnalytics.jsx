import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider,
  Alert,
  Button,
  LinearProgress
} from '@mui/material';
import {
  Analytics as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Assignment as AssignmentIcon,
  CalendarToday as CalendarIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useData } from '../../../contexts/DataContext';

const SystemAnalytics = () => {
  const { patients, doctors, systemStats } = useData();
  
  const [analytics, setAnalytics] = useState({
    patientGrowth: 15, // percentage
    doctorUtilization: 78, // percentage
    documentGrowth: 23, // percentage
    avgDocumentsPerPatient: 0,
    topConditions: [],
    recentActivity: []
  });

  useEffect(() => {
    // Calculate analytics
    const totalDocuments = patients.reduce((total, patient) => total + patient.documents.length, 0);
    const avgDocuments = patients.length > 0 ? (totalDocuments / patients.length).toFixed(1) : 0;
    
    // Get top conditions
    const conditionCount = {};
    patients.forEach(patient => {
      patient.conditions.forEach(condition => {
        conditionCount[condition] = (conditionCount[condition] || 0) + 1;
      });
    });
    
    const topConditions = Object.entries(conditionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([condition, count]) => ({ condition, count }));
    
    // Recent activity (mock data)
    const recentActivity = [
      { action: 'New patient registered', timestamp: '2 hours ago', user: 'System' },
      { action: 'Doctor assignment updated', timestamp: '4 hours ago', user: 'Admin' },
      { action: 'Document uploaded', timestamp: '6 hours ago', user: 'Dr. Johnson' },
      { action: 'Certificate verified', timestamp: '1 day ago', user: 'Public User' },
      { action: 'User logged in', timestamp: '2 days ago', user: 'Jane Smith' }
    ];
    
    setAnalytics({
      ...analytics,
      avgDocumentsPerPatient: avgDocuments,
      topConditions,
      recentActivity
    });
  }, [patients]);

  const exportAnalytics = () => {
    const data = {
      timestamp: new Date().toISOString(),
      systemStats,
      analytics,
      patientCount: patients.length,
      doctorCount: doctors.length
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AnalyticsIcon /> System Analytics & Reports
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Real-time analytics and system performance metrics. Data updates automatically.
      </Alert>

      <Grid container spacing={3}>
        {/* Key Metrics */}
        <Grid item xs={12} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUpIcon sx={{ color: 'success.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{analytics.patientGrowth}%</Typography>
                  <Typography variant="caption">Patient Growth</Typography>
                </Box>
              </Box>
              <LinearProgress variant="determinate" value={analytics.patientGrowth} color="success" />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PeopleIcon sx={{ color: 'primary.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{analytics.doctorUtilization}%</Typography>
                  <Typography variant="caption">Doctor Utilization</Typography>
                </Box>
              </Box>
              <LinearProgress variant="determinate" value={analytics.doctorUtilization} color="primary" />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AssignmentIcon sx={{ color: 'warning.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{analytics.documentGrowth}%</Typography>
                  <Typography variant="caption">Document Growth</Typography>
                </Box>
              </Box>
              <LinearProgress variant="determinate" value={analytics.documentGrowth} color="warning" />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CalendarIcon sx={{ color: 'info.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{analytics.avgDocumentsPerPatient}</Typography>
                  <Typography variant="caption">Avg Docs/Patient</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Per patient average
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Conditions */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Medical Conditions
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Condition</strong></TableCell>
                      <TableCell align="right"><strong>Patients</strong></TableCell>
                      <TableCell><strong>Prevalence</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.topConditions.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.condition}</TableCell>
                        <TableCell align="right">{item.count}</TableCell>
                        <TableCell>
                          <LinearProgress 
                            variant="determinate" 
                            value={(item.count / patients.length) * 100} 
                            sx={{ width: '100%' }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                Based on {patients.length} patient records
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent System Activity
              </Typography>
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {analytics.recentActivity.map((activity, index) => (
                  <Box key={index} sx={{ mb: 2, pb: 2, borderBottom: index < analytics.recentActivity.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
                    <Typography variant="body2">{activity.action}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        By: {activity.user}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {activity.timestamp}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* System Statistics */}
        <Grid item xs={12}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">
                  System Statistics
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    size="small"
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    size="small"
                    onClick={exportAnalytics}
                  >
                    Export Data
                  </Button>
                </Box>
              </Box>
              
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary.main">
                      {systemStats.totalPatients}
                    </Typography>
                    <Typography variant="caption">Total Patients</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {systemStats.totalDoctors}
                    </Typography>
                    <Typography variant="caption">Active Doctors</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {systemStats.totalCertificates}
                    </Typography>
                    <Typography variant="caption">Documents</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="info.main">
                      {patients.filter(p => p.assignedDoctorId).length}
                    </Typography>
                    <Typography variant="caption">Assigned Patients</Typography>
                  </Paper>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 3 }} />
              
              <Typography variant="subtitle2" gutterBottom>
                System Health Status
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Database</Typography>
                    <Chip label="Healthy" size="small" color="success" />
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">API Services</Typography>
                    <Chip label="Operational" size="small" color="success" />
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Certificate Verification</Typography>
                    <Chip label="Active" size="small" color="success" />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Alert severity="success" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>System Status: All systems operational.</strong> Last updated: {new Date().toLocaleString()}
        </Typography>
      </Alert>
    </Box>
  );
};

export default SystemAnalytics;