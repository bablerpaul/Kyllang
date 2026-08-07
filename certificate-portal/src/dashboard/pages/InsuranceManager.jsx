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
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VerifiedIcon from '@mui/icons-material/Verified';
import AddIcon from '@mui/icons-material/Add';

export default function InsuranceManager() {
  const [openSubmitDialog, setOpenSubmitDialog] = useState(false);
  const [openApproveDialog, setOpenApproveDialog] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('All medical certificates & on-chain hashes verified.');
  const [rejectionReason, setRejectionReason] = useState('Invalid policy date');

  const [claims, setClaims] = useState([
    {
      _id: 'CLM-801',
      patientName: 'John Doe',
      provider: 'BlueCross Health',
      policyNumber: 'BC-991823',
      claimAmount: '$2,500',
      approvedAmount: '$2,500',
      status: 'approved',
      certVerified: true,
      blockchainVerified: true,
      date: '2026-07-25',
    },
    {
      _id: 'CLM-802',
      patientName: 'Alice Smith',
      provider: 'Aetna Global Care',
      policyNumber: 'AET-882711',
      claimAmount: '$1,800',
      approvedAmount: '$0',
      status: 'submitted',
      certVerified: true,
      blockchainVerified: true,
      date: '2026-07-26',
    },
    {
      _id: 'CLM-803',
      patientName: 'Robert Johnson',
      provider: 'UnitedHealthcare',
      policyNumber: 'UHC-771622',
      claimAmount: '$3,200',
      approvedAmount: '$0',
      status: 'submitted',
      certVerified: false,
      blockchainVerified: false,
      date: '2026-07-27',
    },
  ]);

  const [newClaim, setNewClaim] = useState({
    patientName: 'John Doe',
    provider: 'BlueCross Health',
    policyNumber: 'BC-991823',
    claimAmount: '1500',
    medicalRecordId: 'EMR-6001',
    certificateId: 'CERT-501',
    treatmentSummary: 'Emergency Bronchitis Treatment',
  });

  const handleVerifyCert = (id) => {
    setClaims(claims.map(c => c._id === id ? { ...c, certVerified: true } : c));
  };

  const handleVerifyBlockchain = (id) => {
    setClaims(claims.map(c => c._id === id ? { ...c, blockchainVerified: true } : c));
  };

  const handleApprove = () => {
    if (!selectedClaim) return;
    setClaims(claims.map(c => c._id === selectedClaim._id ? { ...c, status: 'approved', approvedAmount: c.claimAmount } : c));
    setOpenApproveDialog(false);
  };

  const handleReject = () => {
    if (!selectedClaim) return;
    setClaims(claims.map(c => c._id === selectedClaim._id ? { ...c, status: 'rejected', approvedAmount: '$0' } : c));
    setOpenApproveDialog(false);
  };

  const handleSubmitClaim = (e) => {
    e.preventDefault();
    const created = {
      _id: `CLM-${800 + claims.length + 1}`,
      patientName: newClaim.patientName,
      provider: newClaim.provider,
      policyNumber: newClaim.policyNumber,
      claimAmount: `$${newClaim.claimAmount}`,
      approvedAmount: '$0',
      status: 'submitted',
      certVerified: true,
      blockchainVerified: true,
      date: new Date().toISOString().split('T')[0],
    };
    setClaims([created, ...claims]);
    setOpenSubmitDialog(false);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Insurance Claims & Adjudication
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Verify medical certificates, on-chain blockchain hashes, and adjudicate patient claim payouts
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenSubmitDialog(true)}
          sx={{ bgcolor: '#d97706', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Submit Insurance Claim
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Claim ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Provider & Policy</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Claim Amount</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Cert Verified</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>On-Chain Verified</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Claim Status</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {claims.map((claim) => (
              <TableRow key={claim._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#d97706' }}>{claim._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{claim.patientName}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{claim.provider}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>{claim.policyNumber}</Typography>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{claim.claimAmount}</TableCell>
                <TableCell>
                  {claim.certVerified ? (
                    <Chip label="Cert Validated" size="small" color="success" icon={<CheckCircleIcon />} />
                  ) : (
                    <Button size="small" variant="outlined" onClick={() => handleVerifyCert(claim._id)}>Verify Cert</Button>
                  )}
                </TableCell>
                <TableCell>
                  {claim.blockchainVerified ? (
                    <Chip label="On-Chain Verified" size="small" color="success" icon={<VerifiedIcon />} />
                  ) : (
                    <Button size="small" variant="outlined" onClick={() => handleVerifyBlockchain(claim._id)}>Verify Blockchain</Button>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={claim.status.toUpperCase()}
                    size="small"
                    color={claim.status === 'approved' ? 'success' : claim.status === 'rejected' ? 'error' : 'warning'}
                  />
                </TableCell>
                <TableCell sx={{ textAlign: 'right' }}>
                  {claim.status === 'submitted' && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => { setSelectedClaim(claim); setOpenApproveDialog(true); }}
                      sx={{ bgcolor: '#059669', textTransform: 'none' }}
                    >
                      Adjudicate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Submit Claim Dialog */}
      <Dialog open={openSubmitDialog} onClose={() => setOpenSubmitDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmitClaim}>
          <DialogTitle sx={{ fontWeight: 700 }}>Submit Insurance Claim</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Patient Name" value={newClaim.patientName} onChange={(e) => setNewClaim({ ...newClaim, patientName: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Insurance Provider" value={newClaim.provider} onChange={(e) => setNewClaim({ ...newClaim, provider: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Policy Number" value={newClaim.policyNumber} onChange={(e) => setNewClaim({ ...newClaim, policyNumber: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Claim Amount ($)" type="number" value={newClaim.claimAmount} onChange={(e) => setNewClaim({ ...newClaim, claimAmount: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Medical Record ID" value={newClaim.medicalRecordId} onChange={(e) => setNewClaim({ ...newClaim, medicalRecordId: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Certificate ID" value={newClaim.certificateId} onChange={(e) => setNewClaim({ ...newClaim, certificateId: e.target.value })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenSubmitDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: '#d97706' }}>Submit Claim</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Adjudicate Dialog */}
      <Dialog open={openApproveDialog} onClose={() => setOpenApproveDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Adjudicate Claim {selectedClaim?._id}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Reviewing claim for <strong>{selectedClaim?.patientName}</strong> ({selectedClaim?.claimAmount}).
          </Typography>
          <TextField fullWidth label="Approval Notes" multiline rows={2} value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth label="Rejection Reason (If rejecting)" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button variant="outlined" color="error" startIcon={<CancelIcon />} onClick={handleReject}>
            Reject Claim
          </Button>
          <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={handleApprove}>
            Approve Claim
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
