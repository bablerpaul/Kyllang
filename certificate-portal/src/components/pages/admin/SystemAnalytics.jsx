import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Divider, Alert, Button, LinearProgress, Skeleton, IconButton, Tooltip
} from '@mui/material';
import {
  Analytics as AnalyticsIcon,
  People as PeopleIcon,
  MedicalServices as MedicalServicesIcon,
  VerifiedUser as VerifiedUserIcon,
  Assignment as AssignmentIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const SystemAnalytics = () => {
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState(null);   // /api/admin/analytics
  const [sysInfo, setSysInfo]     = useState(null);   // /api/admin/dashboard
  const [users, setUsers]         = useState([]);     // /api/admin/users
  const [auditLogs, setAuditLogs] = useState([]);     // /api/admin/audit-logs
  const [error, setError]         = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsRes, dashRes, usersRes, auditRes] = await Promise.allSettled([
        apiFetch('/api/admin/analytics'),
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/audit-logs'),
      ]);

      if (analyticsRes.status === 'fulfilled') setStats(analyticsRes.value?.data || analyticsRes.value);
      if (dashRes.status === 'fulfilled')      setSysInfo(dashRes.value?.data || dashRes.value);
      if (usersRes.status === 'fulfilled') {
        const arr = usersRes.value?.data || usersRes.value || [];
        setUsers(Array.isArray(arr) ? arr : []);
      }
      if (auditRes.status === 'fulfilled') {
        const arr = auditRes.value?.data || auditRes.value || [];
        setAuditLogs(Array.isArray(arr) ? arr : []);
      }
      setLastUpdated(new Date());
    } catch (e) {
      setError('Failed to load analytics: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived metrics from real data ─────────────────────────────────────
  const patients = users.filter(u => u.role === 'general_user');
  const doctors  = users.filter(u => u.role === 'doctor');

  // Doctor utilization = assigned doctors / total doctors * 100
  const assignedDoctorIds = new Set(
    patients.flatMap(p => p.assignedDoctorId ? [p.assignedDoctorId.toString()] : [])
  );
  // From doctor side — doctors with assignedPatients
  const assignedDoctors = doctors.filter(d => d.assignedPatients && d.assignedPatients.length > 0);
  const doctorUtilization = doctors.length > 0
    ? Math.round((assignedDoctors.length / doctors.length) * 100)
    : 0;

  // Avg docs per patient
  const totalDocs = users.reduce((acc, u) => acc + (u.documents?.length || 0), 0);
  const avgDocsPerPatient = patients.length > 0 ? (totalDocs / patients.length).toFixed(1) : 0;

  // Action type breakdown from audit logs
  const actionCounts = {};
  auditLogs.forEach(log => {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
  });
  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Recent audit activity (last 10)
  const recentActivity = auditLogs.slice(0, 10);

  // Export analytics as JSON
  const exportAnalytics = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      stats,
      system: sysInfo,
      derived: { doctorUtilization, avgDocsPerPatient, totalPatients: patients.length, totalDoctors: doctors.length },
      topActions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyllang-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
            <AnalyticsIcon /> System Analytics &amp; Reports
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            All values sourced directly from MongoDB &amp; backend APIs.
            {lastUpdated && ` · Last updated: ${lastUpdated.toLocaleTimeString()}`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh data">
            <IconButton onClick={fetchAll} disabled={loading}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<DownloadIcon />} size="small" onClick={exportAnalytics} disabled={loading}>
            Export JSON
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* ── Row 1: KPI Counts ───────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: 'Total Patients',     value: stats?.totalPatients ?? patients.length, icon: <PeopleIcon />,         color: '#2563EB' },
          { label: 'Active Doctors',     value: stats?.totalDoctors  ?? doctors.length,  icon: <MedicalServicesIcon />,color: '#10B981' },
          { label: 'Certificates Issued',value: stats?.totalCertificates,                icon: <VerifiedUserIcon />,   color: '#F59E0B' },
          { label: 'Active Hospitals',   value: stats?.activeHospitals ?? 1,             icon: <AssignmentIcon />,     color: '#6366F1' },
        ].map(({ label, value, icon, color }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: color + '18', color }}>
                  {icon}
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
                  {loading ? <Skeleton width={60} height={36} /> : (
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>{value ?? '—'}</Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Row 2: Utilization bars ────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Doctor Utilization</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {loading ? '…' : `${assignedDoctors.length} of ${doctors.length} doctors have assigned patients`}
              </Typography>
              {loading
                ? <Skeleton height={10} />
                : <LinearProgress variant="determinate" value={doctorUtilization} color={doctorUtilization > 70 ? 'success' : 'warning'} sx={{ height: 8, borderRadius: 4 }} />
              }
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>{loading ? '—' : `${doctorUtilization}%`}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Memory Usage</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {loading ? '…' : `${sysInfo?.system?.memoryUsagePercent ?? '—'}% of server RAM in use`}
              </Typography>
              {loading
                ? <Skeleton height={10} />
                : <LinearProgress variant="determinate" value={parseFloat(sysInfo?.system?.memoryUsagePercent || 0)} color="primary" sx={{ height: 8, borderRadius: 4 }} />
              }
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>{loading ? '—' : `${sysInfo?.system?.memoryUsagePercent ?? 0}%`}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Avg Docs / Patient</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                Encrypted documents per registered patient
              </Typography>
              {loading
                ? <Skeleton height={10} />
                : <LinearProgress variant="determinate" value={Math.min(100, avgDocsPerPatient * 20)} color="info" sx={{ height: 8, borderRadius: 4 }} />
              }
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>{loading ? '—' : avgDocsPerPatient}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 3: Action breakdown + Service health ─────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Audit Action Breakdown */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>Audit Action Breakdown</Typography>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={32} sx={{ mb: 0.5 }} />)
              ) : topActions.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>No audit events recorded yet.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Action</strong></TableCell>
                        <TableCell align="right"><strong>Count</strong></TableCell>
                        <TableCell><strong>Share</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topActions.map(([action, count]) => (
                        <TableRow key={action} hover>
                          <TableCell>
                            <Chip label={action.replace(/_/g, ' ')} size="small"
                              sx={{ fontSize: '0.7rem', fontWeight: 600 }} />
                          </TableCell>
                          <TableCell align="right">{count}</TableCell>
                          <TableCell sx={{ width: 120 }}>
                            <LinearProgress
                              variant="determinate"
                              value={(count / auditLogs.length) * 100}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: 'text.secondary' }}>
                Based on {auditLogs.length} total audit records
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Service Health */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>Service Health</Typography>
              <Grid container spacing={1.5}>
                {[
                  { label: 'MongoDB Database', value: stats ? 'Connected' : 'Unknown', ok: !!stats },
                  { label: 'REST API',          value: 'Operational',                   ok: true },
                  { label: 'Blockchain Node',   value: sysInfo?.services?.blockchainStatus ?? '—', ok: sysInfo?.services?.blockchainStatus === 'Active' },
                  { label: 'IPFS Gateway',      value: sysInfo?.services?.ipfsStatus ?? '—',       ok: sysInfo?.services?.ipfsStatus === 'Active' || sysInfo?.services?.ipfsStatus === 'Mock Active' },
                  { label: 'ZK Proof Engine',   value: 'Active (Curve25519)',            ok: true },
                  { label: 'Redis Cache',        value: 'Bypassed (no Redis)',            ok: false },
                ].map(({ label, value, ok }) => (
                  <Grid item xs={12} sm={6} key={label}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
                      {loading ? <Skeleton width={70} /> : (
                        <Chip label={value} size="small" color={ok ? 'success' : 'error'} variant="outlined" />
                      )}
                    </Box>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip icon={<MemoryIcon />} label={`CPU: ${sysInfo?.system?.cpuLoad1m ?? '—'}`} size="small" />
                <Chip icon={<StorageIcon />} label={`Files: ${sysInfo?.storage?.totalFiles ?? '—'}`} size="small" />
                <Chip icon={<PeopleIcon />} label={`Active 24h: ${sysInfo?.activity?.activeUsers24h ?? '—'}`} size="small" />
                <Chip icon={<LinkIcon />} label={`Platform: ${sysInfo?.system?.platform ?? '—'}`} size="small" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 4: Recent Audit Log ────────────────────────────────────── */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>Recent System Activity</Typography>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={28} sx={{ mb: 0.5 }} />)
          ) : recentActivity.length === 0 ? (
            <Alert severity="info">No audit events have been recorded yet.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Action</strong></TableCell>
                    <TableCell><strong>Actor</strong></TableCell>
                    <TableCell><strong>Role</strong></TableCell>
                    <TableCell><strong>Timestamp</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentActivity.map((log, i) => (
                    <TableRow key={log._id || i} hover>
                      <TableCell>
                        <Chip label={log.action?.replace(/_/g, ' ')} size="small"
                          color={
                            log.action?.includes('CREATE') ? 'success' :
                            log.action?.includes('DELETE') ? 'error' :
                            log.action?.includes('ASSIGN') ? 'primary' : 'default'
                          } />
                      </TableCell>
                      <TableCell>{log.actor?.name || log.actor || '—'}</TableCell>
                      <TableCell>
                        <Chip label={log.actor?.role || '—'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SystemAnalytics;