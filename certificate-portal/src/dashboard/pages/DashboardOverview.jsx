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
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Title & Quick Actions */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
        <Box sx={{ maxWidth: 760 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Hospital System Dashboard
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Real-time Electronic Medical Records, IPFS & Blockchain Anchoring Overview
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/emr-dashboard/emr')}
          >
            New EMR Encounter
          </Button>
        </Box>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 112 }}>
              <Avatar sx={{ bgcolor: 'rgba(37, 99, 235, 0.1)', color: 'primary.main', width: 50, height: 50 }}>
                <PeopleAltIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Total Registered Patients
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {stats.totalPatients}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 112 }}>
              <Avatar sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'success.main', width: 50, height: 50 }}>
                <MedicalServicesIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Active Doctors
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {stats.totalDoctors}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 112 }}>
              <Avatar sx={{ bgcolor: 'rgba(37, 99, 235, 0.1)', color: 'secondary.main', width: 50, height: 50 }}>
                <FolderSharedIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Anchored EMR Records
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {stats.totalEMRs}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 112 }}>
              <Avatar sx={{ bgcolor: 'rgba(245, 158, 11, 0.1)', color: 'warning.main', width: 50, height: 50 }}>
                <ShieldIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Insurance Claims
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {stats.pendingClaims} Pending / {stats.approvedClaims} Approved
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* System Status & Blockchain Widget */}
      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
              Blockchain Anchoring Status
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Ganache Local Testnet (`http://127.0.0.1:7545`) and Smart Contract `EMRRegistry.sol`
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Smart Contract Address:</Typography>
                <Chip label="0x4cB06...573Ec" size="small" sx={{ bgcolor: 'rgba(37, 99, 235, 0.08)', color: 'primary.main', fontFamily: 'monospace' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>IPFS Storage Gateway:</Typography>
                <Chip label="Online (CID v0/v1)" size="small" color="success" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Cryptographic SHA-256 Engine:</Typography>
                <Chip label="Active" size="small" color="primary" />
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
              Quick Module Navigation
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<PeopleAltIcon />} onClick={() => navigate('/emr-dashboard/patients')} sx={{ justifyContent: 'flex-start', px: 2 }}>
                  Patients Directory
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<MedicalServicesIcon />} onClick={() => navigate('/emr-dashboard/doctors')} sx={{ justifyContent: 'flex-start', px: 2 }}>
                  Doctors Roster
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<ScienceIcon />} onClick={() => navigate('/emr-dashboard/lab-reports')} sx={{ justifyContent: 'flex-start', px: 2 }}>
                  Lab Diagnostics
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<VerifiedUserIcon />} onClick={() => navigate('/emr-dashboard/certificates')} sx={{ justifyContent: 'flex-start', px: 2 }}>
                  Medical Certificates
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<ShieldIcon />} onClick={() => navigate('/emr-dashboard/insurance')} sx={{ justifyContent: 'flex-start', px: 2 }}>
                  Insurance Adjudication
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button fullWidth variant="outlined" startIcon={<StorageIcon />} onClick={() => navigate('/emr-dashboard/audit-logs')} sx={{ justifyContent: 'flex-start', px: 2 }}>
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
