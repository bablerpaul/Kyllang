import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent,
  Avatar, Chip, Button, Skeleton, Divider, Tooltip,
  IconButton, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import LinkIcon from '@mui/icons-material/Link';
import CloudIcon from '@mui/icons-material/Cloud';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import EventIcon from '@mui/icons-material/Event';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

function StatCard({ icon, label, value, sub, color = 'primary', loading }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 110 }}>
        <Avatar sx={{ bgcolor: `${color}.light`, color: `${color}.dark`, width: 50, height: 50 }}>
          {icon}
        </Avatar>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
            {label}
          </Typography>
          {loading ? (
            <Skeleton variant="text" width={60} height={36} />
          ) : (
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.1 }}>
              {value ?? '—'}
            </Typography>
          )}
          {sub && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{sub}</Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Patient Dashboard Overview ───────────────────────────────────────────
function PatientDashboardOverview() {
  const navigate = useNavigate();
  const { name } = useAuth();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [apptRes, docRes, certRes] = await Promise.allSettled([
        apiFetch('/api/emr/appointments'),
        apiFetch('/api/patient/documents'),
        apiFetch('/api/patient/certificates'),
      ]);

      if (apptRes.status === 'fulfilled') {
        const data = apptRes.value?.data || apptRes.value || [];
        setAppointments(Array.isArray(data) ? data : []);
      }
      if (docRes.status === 'fulfilled') {
        const data = docRes.value?.data || docRes.value || [];
        setDocuments(Array.isArray(data) ? data : []);
      }
      if (certRes.status === 'fulfilled') {
        const data = certRes.value?.data || certRes.value || [];
        setCertificates(Array.isArray(data) ? data : []);
      }
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Patient dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const upcomingAppointments = appointments.filter(a => a.status === 'scheduled');
  const completedAppointments = appointments.filter(a => a.status === 'completed');

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Welcome, {name || 'Patient'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Your personal health dashboard
            {lastUpdated && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </Typography>
        </Box>
        <Tooltip title="Refresh all data">
          <IconButton onClick={fetchAll} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={<EventNoteIcon />}
            label="Upcoming Appointments"
            value={upcomingAppointments.length}
            sub="Scheduled visits"
            color="primary"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={<HealthAndSafetyIcon />}
            label="Past Visits"
            value={completedAppointments.length}
            sub="Completed consultations"
            color="success"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={<VerifiedUserIcon />}
            label="My Certificates"
            value={certificates.length}
            sub="Issued certificates"
            color="warning"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Upcoming Appointments + Quick Nav */}
      <Grid container spacing={2.5}>
        {/* Upcoming Appointments Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Upcoming Appointments
              </Typography>
              <Button
                size="small"
                sx={{ textTransform: 'none' }}
                onClick={() => navigate('/dashboard/appointments')}
              >
                View All →
              </Button>
            </Box>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Box key={i} sx={{ mb: 1.5 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" height={14} />
                </Box>
              ))
            ) : upcomingAppointments.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <EventIcon sx={{ fontSize: 48, mb: 1, opacity: 0.2 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No upcoming appointments
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Doctor</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {upcomingAppointments.slice(0, 5).map((apt) => (
                      <TableRow key={apt._id} hover>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {formatDate(apt.appointmentDate)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{apt.timeSlot || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {apt.doctor?.name || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{apt.reason || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Quick Navigation */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Quick Navigation</Typography>
            <Grid container spacing={1.5}>
              {[
                { label: 'Health Records', icon: <HealthAndSafetyIcon />, path: '/dashboard/health-records' },
                { label: 'My Documents', icon: <FolderSharedIcon />, path: '/dashboard/my-documents' },
                { label: 'Appointments', icon: <EventNoteIcon />, path: '/dashboard/appointments' },
                { label: 'My Certificates', icon: <VerifiedUserIcon />, path: '/dashboard/my-certificates' },
                { label: 'Request Certificate', icon: <AssignmentIndIcon />, path: '/dashboard/generate-certificate' },
                { label: 'ZK QR Verify', icon: <StorageIcon />, path: '/dashboard/qr-verify' },
              ].map(({ label, icon, path }) => (
                <Grid item xs={6} key={path}>
                  <Button fullWidth variant="outlined" startIcon={icon}
                    onClick={() => navigate(path)}
                    sx={{ justifyContent: 'flex-start', px: 1.5, textTransform: 'none', fontSize: '0.8rem' }}>
                    {label}
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── Admin / Doctor Dashboard Overview ────────────────────────────────────
function AdminDashboardOverview() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch analytics + system dashboard in parallel
      const [analyticsRes, dashRes, auditRes] = await Promise.allSettled([
        apiFetch('/api/admin/analytics'),
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/audit-logs'),
      ]);

      if (analyticsRes.status === 'fulfilled') {
        setStats(analyticsRes.value?.data || analyticsRes.value);
      }
      if (dashRes.status === 'fulfilled') {
        setSysInfo(dashRes.value?.data || dashRes.value);
      }
      if (auditRes.status === 'fulfilled') {
        const logs = auditRes.value?.data || auditRes.value || [];
        setAuditLogs(Array.isArray(logs) ? logs.slice(0, 8) : []);
      }
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const doctorUtilization = stats && stats.totalDoctors > 0
    ? Math.min(100, Math.round((stats.totalDoctors > 0 ? (stats.totalPatients / stats.totalDoctors) : 0) * 10))
    : null;

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Kyllang Health — Dashboard
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Live data from MongoDB · Blockchain · ZK Proof Engine
            {lastUpdated && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </Typography>
        </Box>
        <Tooltip title="Refresh all data">
          <IconButton onClick={fetchAll} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<PeopleAltIcon />}
            label="Registered Patients"
            value={stats?.totalPatients ?? stats?.totalUsers}
            color="primary"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<MedicalServicesIcon />}
            label="Active Doctors"
            value={stats?.totalDoctors}
            color="success"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<VerifiedUserIcon />}
            label="Certificates Issued"
            value={stats?.totalCertificates}
            color="warning"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<AssignmentIndIcon />}
            label="Active Hospitals"
            value={stats?.activeHospitals ?? 1}
            sub="On-chain registered"
            color="info"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* System Info + Recent Activity */}
      <Grid container spacing={2.5}>
        {/* System Health */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              System Health
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* CPU */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MemoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2">CPU Load (1m avg)</Typography>
                  </Box>
                  {loading ? (
                    <Skeleton width={40} />
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {sysInfo?.system?.cpuLoad1m ?? '—'}
                    </Typography>
                  )}
                </Box>
                <LinearProgress
                  variant={loading ? 'indeterminate' : 'determinate'}
                  value={loading ? undefined : Math.min(100, parseFloat(sysInfo?.system?.cpuLoad1m || 0) * 25)}
                  color="primary"
                />
              </Box>

              {/* Memory */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StorageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2">Memory Usage</Typography>
                  </Box>
                  {loading ? (
                    <Skeleton width={50} />
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {sysInfo?.system?.memoryUsagePercent ?? '—'}%
                    </Typography>
                  )}
                </Box>
                <LinearProgress
                  variant={loading ? 'indeterminate' : 'determinate'}
                  value={loading ? undefined : parseFloat(sysInfo?.system?.memoryUsagePercent || 0)}
                  color={parseFloat(sysInfo?.system?.memoryUsagePercent || 0) > 80 ? 'error' : 'success'}
                />
              </Box>

              <Divider />

              {/* Service chips */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                {[
                  { label: 'Blockchain', icon: <LinkIcon fontSize="small" />, value: sysInfo?.services?.blockchainStatus },
                  { label: 'IPFS Gateway', icon: <CloudIcon fontSize="small" />, value: sysInfo?.services?.ipfsStatus },
                  { label: 'Active Users (24h)', icon: <PeopleAltIcon fontSize="small" />, value: sysInfo?.activity?.activeUsers24h },
                  { label: 'Stored Files', icon: <StorageIcon fontSize="small" />, value: sysInfo?.storage?.totalFiles },
                  { label: 'Platform', icon: <MemoryIcon fontSize="small" />, value: sysInfo?.system?.platform },
                ].map(({ label, icon, value }) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: 'text.secondary' }}>
                      {icon}
                      <Typography variant="body2">{label}</Typography>
                    </Box>
                    {loading ? (
                      <Skeleton width={60} />
                    ) : (
                      <Chip
                        label={value ?? '—'}
                        size="small"
                        color={
                          value === 'Offline' ? 'error' :
                          value === 'Active' || value === 'Mock Active' ? 'success' : 'default'
                        }
                        variant="outlined"
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Recent Audit Activity */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Recent System Activity
            </Typography>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Box key={i} sx={{ mb: 1.5 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" height={14} />
                </Box>
              ))
            ) : auditLogs.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                No audit events yet.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>
                {auditLogs.map((log, i) => (
                  <Box key={log._id || i} sx={{
                    py: 1.2,
                    borderBottom: i < auditLogs.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={log.action?.replace(/_/g, ' ')}
                          size="small"
                          sx={{
                            fontSize: '0.68rem', fontWeight: 700, height: 20,
                            bgcolor: log.action?.includes('CREATE') ? 'rgba(16,185,129,0.12)' :
                                     log.action?.includes('DELETE') ? 'rgba(239,68,68,0.12)' :
                                     log.action?.includes('ASSIGN') ? 'rgba(99,102,241,0.12)' :
                                     'rgba(100,116,139,0.1)',
                            color: log.action?.includes('CREATE') ? 'success.dark' :
                                   log.action?.includes('DELETE') ? 'error.dark' :
                                   log.action?.includes('ASSIGN') ? '#6366F1' :
                                   'text.secondary',
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', ml: 1 }}>
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
                          : ''}
                      </Typography>
                    </Box>
                    {log.actor && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.3, pl: 0.5 }}>
                        By: {log.actor?.name || log.actor} · {log.actor?.role || ''}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}
            {role === 'hospital_admin' && (
              <Button size="small" sx={{ mt: 2, textTransform: 'none' }} onClick={() => navigate('/dashboard/audit-logs')}>
                View Full Audit Log →
              </Button>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Quick Nav */}
      {role === 'hospital_admin' && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Quick Navigation</Typography>
          <Grid container spacing={1.5}>
            {[
              { label: 'Patients Directory', icon: <PeopleAltIcon />, path: '/dashboard/patients' },
              { label: 'Doctors Roster', icon: <MedicalServicesIcon />, path: '/dashboard/doctors' },
              { label: 'Doctor Assignment', icon: <AssignmentIndIcon />, path: '/dashboard/assignments' },
              { label: 'Document Upload', icon: <StorageIcon />, path: '/dashboard/documents' },
              { label: 'Certificates', icon: <VerifiedUserIcon />, path: '/dashboard/certificates' },
              { label: 'Audit Logs', icon: <StorageIcon />, path: '/dashboard/audit-logs' },
            ].map(({ label, icon, path }) => (
              <Grid item xs={6} sm={4} md={2} key={path}>
                <Button fullWidth variant="outlined" startIcon={icon}
                  onClick={() => navigate(path)}
                  sx={{ justifyContent: 'flex-start', px: 1.5, textTransform: 'none', fontSize: '0.8rem' }}>
                  {label}
                </Button>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}
    </Box>
  );
}

// ── Main Export — routes to correct view based on role ────────────────────
export default function DashboardOverview() {
  const { role } = useAuth();

  if (role === 'general_user') {
    return <PatientDashboardOverview />;
  }

  return <AdminDashboardOverview />;
}
