import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Tooltip,
  CircularProgress,
  Alert
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import BlockIcon from '@mui/icons-material/Block';
import { apiFetch } from '../../utils/api';

export default function CertificatesManager() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // For viewing details
  const [selectedCert, setSelectedCert] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/admin/certificates');
      setCertificates(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch certificates');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (cert) => {
    setSelectedCert(cert);
    setOpenDialog(true);
  };

  if (loading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            System Certificates Monitoring
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Read-only monitoring of all ZKP medical certificates across the system
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Cert ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Issuing Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Valid Period</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Commitment Hash</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {certificates.map((cert) => {
              const isRevoked = cert.onChainRevoked === true || cert.revoked === true || cert.status === 'revoked';
              const isUnknown = cert.onChainStatusAvailable === false && !isRevoked;
              return (
              <TableRow key={cert._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#7c3aed' }}>{cert._id.substring(0,8)}...</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{cert.patient?.name || 'Unknown'}</TableCell>
                <TableCell>{cert.issuedBy?.name || 'Unknown'}</TableCell>
                <TableCell>
                  {isRevoked ? (
                    <Chip icon={<BlockIcon />} label="REVOKED" size="small" color="error" />
                  ) : isUnknown ? (
                    <Chip label="UNKNOWN" size="small" color="warning" />
                  ) : (
                    <Chip label="ACTIVE" size="small" color="success" />
                  )}
                </TableCell>
                <TableCell>{new Date(cert.validFrom).toLocaleDateString()} to {new Date(cert.validUntil).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Tooltip title={cert.publicCommitmentHash}>
                    <Chip label={`${cert.publicCommitmentHash?.substring(0, 10) || 'N/A'}...`} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f3e8ff', color: '#6b21a8' }} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                   <Button size="small" variant="outlined" onClick={() => handleViewDetails(cert)}>Details</Button>
                </TableCell>
              </TableRow>
            )})}
            {certificates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">No certificates found in the database.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        {selectedCert && (() => {
          const isRevoked = selectedCert.onChainRevoked === true || selectedCert.revoked === true || selectedCert.status === 'revoked';
          const isUnknown = selectedCert.onChainStatusAvailable === false && !isRevoked;
          return (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>Certificate Details</DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Certificate ID</Typography>
                  <Typography variant="body1">{selectedCert._id}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Effective Status (On-Chain/DB)</Typography>
                  <Typography variant="body1" color={isRevoked ? 'error' : (isUnknown ? 'warning.main' : 'success.main')}>
                    {isRevoked ? 'REVOKED' : (isUnknown ? 'UNKNOWN' : 'ACTIVE')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Patient</Typography>
                  <Typography variant="body1">{selectedCert.patient?.name || 'Unknown'} ({selectedCert.patient?.patientId || selectedCert.patient?._id})</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Issuing Doctor</Typography>
                  <Typography variant="body1">{selectedCert.issuedBy?.name}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Valid From</Typography>
                  <Typography variant="body1">{new Date(selectedCert.validFrom).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Valid Until</Typography>
                  <Typography variant="body1">{new Date(selectedCert.validUntil).toLocaleString()}</Typography>
                </Grid>
                {selectedCert.revoked && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="textSecondary">Revoked At</Typography>
                    <Typography variant="body1">{new Date(selectedCert.revokedAt).toLocaleString()}</Typography>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">Blockchain Commitment</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedCert.publicCommitmentHash}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">Blockchain Transaction</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedCert.transactionHash || 'N/A'}
                  </Typography>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setOpenDialog(false)}>Close</Button>
            </DialogActions>
          </>
          );
        })()}
      </Dialog>
    </Box>
  );
}
