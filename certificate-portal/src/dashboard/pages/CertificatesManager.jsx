import React, { useState } from 'react';
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
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Tooltip,
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VerifiedIcon from '@mui/icons-material/Verified';
import AddIcon from '@mui/icons-material/Add';

export default function CertificatesManager() {
  const [openDialog, setOpenDialog] = useState(false);
  const [certificates, setCertificates] = useState([
    {
      _id: 'CERT-501',
      patientName: 'John Doe',
      doctorName: 'Dr. Sarah Jenkins',
      emrId: 'EMR-6001',
      diagnosis: 'Acute Bronchitis - 5 Days Sick Leave',
      validFrom: '2026-07-25',
      validUntil: '2026-07-30',
      verificationHash: 'a7c9f8e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8',
      transactionHash: '0x8f2a9d1b4c7e3f8a0b9c2d1e4f6a8b0c2d4e6f8a0b9c2d1e4f6a8b0c2d4e6f8a',
    },
    {
      _id: 'CERT-502',
      patientName: 'Alice Smith',
      doctorName: 'Dr. Marcus Vance',
      emrId: 'EMR-6002',
      diagnosis: 'Severe Migraine - Medical Rest',
      validFrom: '2026-07-26',
      validUntil: '2026-07-28',
      verificationHash: 'b8d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
      transactionHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    },
  ]);

  const [newCert, setNewCert] = useState({
    patientName: 'John Doe',
    emrId: 'EMR-6001',
    diagnosis: 'Hypertension Rest Certificate',
    remarks: 'Fit to resume duties on 2026-08-05',
    validFrom: '2026-07-27',
    validUntil: '2026-08-04',
  });

  const handleIssue = (e) => {
    e.preventDefault();
    const fakeTx = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const fakeHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const created = {
      _id: `CERT-${500 + certificates.length + 1}`,
      patientName: newCert.patientName,
      doctorName: 'Dr. Sarah Jenkins',
      emrId: newCert.emrId,
      diagnosis: newCert.diagnosis,
      validFrom: newCert.validFrom,
      validUntil: newCert.validUntil,
      verificationHash: fakeHash,
      transactionHash: fakeTx,
    };

    setCertificates([created, ...certificates]);
    setOpenDialog(false);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Medical Certificates
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Verified medical certificates connected directly to EMR encounters with HMAC & Blockchain verification hashes
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#7c3aed', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Issue EMR Medical Certificate
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Cert ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Issuing Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Linked EMR ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Diagnosis / Purpose</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Valid Period</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Verification Hash</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Blockchain Tx</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {certificates.map((cert) => (
              <TableRow key={cert._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#7c3aed' }}>{cert._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{cert.patientName}</TableCell>
                <TableCell>{cert.doctorName}</TableCell>
                <TableCell><Chip label={cert.emrId} size="small" color="primary" variant="outlined" /></TableCell>
                <TableCell>{cert.diagnosis}</TableCell>
                <TableCell>{cert.validFrom} to {cert.validUntil}</TableCell>
                <TableCell>
                  <Tooltip title={cert.verificationHash}>
                    <Chip label={`${cert.verificationHash.substring(0, 10)}...`} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f3e8ff', color: '#6b21a8' }} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip icon={<VerifiedIcon />} label={`${cert.transactionHash.substring(0, 10)}...`} size="small" color="success" sx={{ fontFamily: 'monospace' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleIssue}>
          <DialogTitle sx={{ fontWeight: 700 }}>Issue EMR-Connected Certificate</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Patient Name" value={newCert.patientName} onChange={(e) => setNewCert({ ...newCert, patientName: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Linked EMR ID" value={newCert.emrId} onChange={(e) => setNewCert({ ...newCert, emrId: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Diagnosis & Sick Leave Purpose" value={newCert.diagnosis} onChange={(e) => setNewCert({ ...newCert, diagnosis: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth type="date" label="Valid From" InputLabelProps={{ shrink: true }} value={newCert.validFrom} onChange={(e) => setNewCert({ ...newCert, validFrom: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }} value={newCert.validUntil} onChange={(e) => setNewCert({ ...newCert, validUntil: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Doctor Remarks" multiline rows={2} value={newCert.remarks} onChange={(e) => setNewCert({ ...newCert, remarks: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={<VerifiedUserIcon />} sx={{ bgcolor: '#7c3aed' }}>
              Issue & Anchor Hash
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
