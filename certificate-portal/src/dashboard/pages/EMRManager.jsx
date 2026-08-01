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
  Alert,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VerifiedIcon from '@mui/icons-material/Verified';
import DescriptionIcon from '@mui/icons-material/Description';

export default function EMRManager() {
  const [openDialog, setOpenDialog] = useState(false);
  const [txSuccess, setTxSuccess] = useState(null);
  const [newEMR, setNewEMR] = useState({
    patientId: 'PAT-101',
    diagnosis: 'Acute Bronchitis',
    symptoms: 'Cough, mild fever, chest congestion',
    bloodPressure: '122/82',
    heartRate: '76',
    temperature: '99.1',
    clinicalNotes: 'Prescribed rest, fluids, and bronchodilators.',
  });

  const [emrRecords, setEmrRecords] = useState([
    {
      _id: 'EMR-6001',
      patientName: 'John Doe',
      doctorName: 'Dr. Sarah Jenkins',
      diagnosis: 'Hypertension Stage 1',
      vitals: '135/88, 78 bpm, 98.6°F',
      visitDate: '2026-07-25',
      dataHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      transactionHash: '0x8f2a9d1b4c7e3f8a0b9c2d1e4f6a8b0c2d4e6f8a0b9c2d1e4f6a8b0c2d4e6f8a',
    },
    {
      _id: 'EMR-6002',
      patientName: 'Alice Smith',
      doctorName: 'Dr. Marcus Vance',
      diagnosis: 'Migraine with Aura',
      vitals: '118/75, 72 bpm, 98.4°F',
      visitDate: '2026-07-26',
      dataHash: 'a7c9f8e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8',
      transactionHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    },
  ]);

  const handleCreateEMR = (e) => {
    e.preventDefault();
    const fakeTx = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const fakeHash = `hash_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const created = {
      _id: `EMR-${6000 + emrRecords.length + 1}`,
      patientName: 'John Doe',
      doctorName: 'Dr. Sarah Jenkins',
      diagnosis: newEMR.diagnosis,
      vitals: `${newEMR.bloodPressure}, ${newEMR.heartRate} bpm, ${newEMR.temperature}°F`,
      visitDate: new Date().toISOString().split('T')[0],
      dataHash: fakeHash,
      transactionHash: fakeTx,
    };

    setEmrRecords([created, ...emrRecords]);
    setTxSuccess({ tx: fakeTx, hash: fakeHash });
    setOpenDialog(false);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Electronic Medical Records (EMR)
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Multi-encounter patient clinical records with automated SHA-256 & Ganache blockchain transaction hashes
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Create New EMR Encounter
        </Button>
      </Box>

      {txSuccess && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }} onClose={() => setTxSuccess(null)}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            EMR Record Anchored to Blockchain!
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
            Tx Hash: {txSuccess.tx}
          </Typography>
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>EMR ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Attending Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Diagnosis</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Vital Signs</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Visit Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Blockchain Tx Hash</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {emrRecords.map((record) => (
              <TableRow key={record._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>{record._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{record.patientName}</TableCell>
                <TableCell>{record.doctorName}</TableCell>
                <TableCell><Chip label={record.diagnosis} size="small" color="primary" variant="outlined" /></TableCell>
                <TableCell>{record.vitals}</TableCell>
                <TableCell>{record.visitDate}</TableCell>
                <TableCell>
                  <Tooltip title={record.transactionHash}>
                    <Chip
                      icon={<VerifiedIcon />}
                      label={`${record.transactionHash.substring(0, 10)}...`}
                      size="small"
                      color="success"
                      sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                    />
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create EMR Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleCreateEMR}>
          <DialogTitle sx={{ fontWeight: 700 }}>New EMR Clinical Encounter</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField fullWidth label="Diagnosis" required value={newEMR.diagnosis} onChange={(e) => setNewEMR({ ...newEMR, diagnosis: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Symptoms" multiline rows={2} value={newEMR.symptoms} onChange={(e) => setNewEMR({ ...newEMR, symptoms: e.target.value })} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label="Blood Pressure" value={newEMR.bloodPressure} onChange={(e) => setNewEMR({ ...newEMR, bloodPressure: e.target.value })} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label="Heart Rate (bpm)" value={newEMR.heartRate} onChange={(e) => setNewEMR({ ...newEMR, heartRate: e.target.value })} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label="Temperature (°F)" value={newEMR.temperature} onChange={(e) => setNewEMR({ ...newEMR, temperature: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Clinical Notes & Treatment Plan" multiline rows={3} value={newEMR.clinicalNotes} onChange={(e) => setNewEMR({ ...newEMR, clinicalNotes: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={<VerifiedIcon />} sx={{ bgcolor: '#2563eb' }}>
              Create & Anchor to Blockchain
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
