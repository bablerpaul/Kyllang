import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Avatar,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';

import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import ShieldIcon from '@mui/icons-material/Shield';
import ScienceIcon from '@mui/icons-material/Science';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorageIcon from '@mui/icons-material/Storage';
import AddIcon from '@mui/icons-material/Add';

import { useNavigate } from 'react-router-dom';

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPatients: 24,
    totalDoctors: 8,
    totalEMRs: 42,
    pendingClaims: 5,
    approvedClaims: 18,
    ipfsFiles: 14,
  });

  return (
    <Box>
      {/* Title & Quick Actions */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Hospital System Dashboard
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Real-time Electronic Medical Records, IPFS & Blockchain Anchoring Overview
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/emr-dashboard/emr')}
            sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
          >
            New EMR Encounter
          </Button>
        </Box>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#dbeafe', color: '#2563eb', width: 50, height: 50 }}>
                <PeopleAltIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  Total Registered Patients
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {stats.totalPatients}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#f0fdf4', color: '#16a34a', width: 50, height: 50 }}>
                <MedicalServicesIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  Active Doctors
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {stats.totalDoctors}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#fae8ff', color: '#c026d3', width: 50, height: 50 }}>
                <FolderSharedIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  Anchored EMR Records
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {stats.totalEMRs}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#fef3c7', color: '#d97706', width: 50, height: 50 }}>
                <ShieldIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  Insurance Claims
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {stats.pendingClaims} Pending / {stats.approvedClaims} Approved
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* System Status & Blockchain Widget */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px', bgcolor: '#0f172a', color: '#ffffff' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#38bdf8' }}>
              Blockchain Anchoring Status
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
              Ganache Local Testnet (`http://127.0.0.1:7545`) & Smart Contract `EMRRegistry.sol`
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: '#cbd5e1' }}>Smart Contract Address:</Typography>
                <Chip label="0x4cB06...573Ec" size="small" sx={{ bgcolor: '#1e293b', color: '#38bdf8', fontFamily: 'monospace' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: '#cbd5e1' }}>IPFS Storage Gateway:</Typography>
                <Chip label="Online (CID v0/v1)" size="small" color="success" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: '#cbd5e1' }}>Cryptographic SHA-256 Engine:</Typography>
                <Chip label="Active" size="small" sx={{ bgcolor: '#0284c7', color: '#fff' }} />
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#0f172a' }}>
              Quick Module Navigation
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<PeopleAltIcon />} onClick={() => navigate('/emr-dashboard/patients')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Patients Directory
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<MedicalServicesIcon />} onClick={() => navigate('/emr-dashboard/doctors')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Doctors Roster
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<ScienceIcon />} onClick={() => navigate('/emr-dashboard/lab-reports')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Lab Diagnostics
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<VerifiedUserIcon />} onClick={() => navigate('/emr-dashboard/certificates')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Medical Certificates
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<ShieldIcon />} onClick={() => navigate('/emr-dashboard/insurance')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Insurance Adjudication
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<StorageIcon />} onClick={() => navigate('/emr-dashboard/audit-logs')} sx={{ justifyLeft: true, textTransform: 'none', borderRadius: '8px' }}>
                  Real-time Audit Logs
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
