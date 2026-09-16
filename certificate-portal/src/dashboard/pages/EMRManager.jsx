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
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  Tooltip,
  CircularProgress,
  IconButton
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import GppGoodIcon from '@mui/icons-material/GppGood';
import ErrorIcon from '@mui/icons-material/Error';
import { apiFetch } from '../../utils/api';

export default function EMRManager() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emrRecords, setEmrRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [verificationResults, setVerificationResults] = useState({});

  useEffect(() => {
    fetchEMRRecords();
  }, []);

  const fetchEMRRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const emrRes = await apiFetch('/api/emr');
      if (emrRes.success) {
        setEmrRecords(emrRes.data || []);
      } else {
        setError('Failed to load EMR records: ' + emrRes.message);
      }
    } catch (err) {
      console.error(err);
      setError('Unable to load EMR records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = (record) => {
    setSelectedRecord(record);
    setDetailsOpen(true);
  };

  const handleVerifyIntegrity = async (id) => {
    setVerifyingId(id);
    try {
      const res = await apiFetch(`/api/emr/${id}/verify`);
      setVerificationResults((prev) => ({
        ...prev,
        [id]: res
      }));
    } catch (err) {
      console.error(err);
      setVerificationResults((prev) => ({
        ...prev,
        [id]: { verified: false, message: 'VERIFICATION FAILED API ERROR' }
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  const renderVitals = (record) => {
    const bp = record.vitals?.bloodPressure || record.vitalSigns?.bloodPressure || 'N/A';
    const hr = record.vitals?.heartRate || record.vitalSigns?.heartRate || 'N/A';
    const temp = record.vitals?.temperature || record.vitalSigns?.temperature || 'N/A';
    
    if (bp === 'N/A' && hr === 'N/A' && temp === 'N/A') return 'Not recorded';
    return `${bp}, ${hr} bpm, ${temp}°F`;
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Electronic Medical Records Verification
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Monitor and verify clinical EMRs anchored to the blockchain
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchEMRRecords}
          disabled={loading}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Refresh Data
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }} action={
          <Button color="inherit" size="small" onClick={fetchEMRRecords}>Retry</Button>
        }>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Error
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            {error}
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
              <TableCell sx={{ fontWeight: 700, align: 'right' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : emrRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#64748b' }}>
                  No EMR encounters found.
                </TableCell>
              </TableRow>
            ) : (
              emrRecords.map((record) => (
                <TableRow key={record._id} hover>
                  <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>
                    {record._id.substring(record._id.length - 8).toUpperCase()}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {record.patient?.user?.name || record.patient?.name || 'Unknown Patient'}
                  </TableCell>
                  <TableCell>
                    {record.doctor?.user?.name || record.doctor?.name || 'Unknown Doctor'}
                  </TableCell>
                  <TableCell>
                    <Chip label={record.diagnosis || 'None'} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {renderVitals(record)}
                  </TableCell>
                  <TableCell>
                    {new Date(record.visitDate || record.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {verificationResults[record._id] ? (
                      <Tooltip title={verificationResults[record._id].message}>
                        <Chip
                          icon={verificationResults[record._id].verified ? <GppGoodIcon /> : <ErrorIcon />}
                          label={verificationResults[record._id].verified ? '✓ VERIFIED' : `⚠ ${verificationResults[record._id].message}`}
                          size="small"
                          color={verificationResults[record._id].verified ? 'success' : 'error'}
                          sx={{ fontWeight: 700 }}
                        />
                      </Tooltip>
                    ) : record.transactionHash ? (
                      <Tooltip title="Needs Verification">
                        <Chip
                          icon={<VerifiedIcon />}
                          label={`${record.transactionHash.substring(0, 10)}...`}
                          size="small"
                          color="default"
                          sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                        />
                      </Tooltip>
                    ) : (
                      <Chip label="Not anchored" size="small" color="default" sx={{ fontWeight: 600 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button 
                      variant="outlined" 
                      color="primary" 
                      size="small" 
                      onClick={() => handleVerifyIntegrity(record._id)}
                      disabled={verifyingId === record._id}
                      sx={{ mr: 1, textTransform: 'none', fontWeight: 600 }}
                    >
                      {verifyingId === record._id ? <CircularProgress size={20} /> : 'Verify Integrity'}
                    </Button>
                    <Tooltip title="View Details">
                      <IconButton onClick={() => handleOpenDetails(record)} size="small" color="primary">
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          EMR Encounter Details
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {selectedRecord && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>PATIENT INFORMATION</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#fafafa' }}>
                  <Typography variant="body2" color="text.secondary">Name</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>{selectedRecord.patient?.user?.name || selectedRecord.patient?.name || 'Unknown'}</Typography>
                  
                  <Typography variant="body2" color="text.secondary">Contact</Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>{selectedRecord.patient?.user?.email || selectedRecord.patient?.email || 'Not provided'}</Typography>

                  <Typography variant="body2" color="text.secondary">Gender</Typography>
                  <Typography variant="body1">{selectedRecord.patient?.gender || 'Not provided'}</Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>ENCOUNTER SUMMARY</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#fafafa' }}>
                  <Typography variant="body2" color="text.secondary">Attending Doctor</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>{selectedRecord.doctor?.user?.name || selectedRecord.doctor?.name || 'Unknown'}</Typography>
                  
                  <Typography variant="body2" color="text.secondary">Visit Date</Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>{new Date(selectedRecord.visitDate || selectedRecord.createdAt).toLocaleString()}</Typography>

                  <Typography variant="body2" color="text.secondary">Appointment Ref</Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>{selectedRecord.appointment || 'Not provided'}</Typography>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>CLINICAL INFORMATION</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#fafafa' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">Diagnosis</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, mb: 1.5 }}>{selectedRecord.diagnosis || 'Not provided'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">Vital Signs</Typography>
                      <Typography variant="body1" sx={{ mb: 1.5 }}>{renderVitals(selectedRecord)}</Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Symptoms</Typography>
                      <Typography variant="body1" sx={{ mb: 1.5 }}>
                        {selectedRecord.symptoms?.length > 0 ? selectedRecord.symptoms.join(', ') : 'Not recorded'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Clinical Notes</Typography>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedRecord.clinicalNotes || 'Not provided'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>BLOCKCHAIN INTEGRITY</Typography>
                
                {verificationResults[selectedRecord._id] ? (
                  <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: verificationResults[selectedRecord._id].verified ? '#f0fdf4' : '#fef2f2', border: `1px solid ${verificationResults[selectedRecord._id].verified ? '#bbf7d0' : '#fecaca'}` }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      {verificationResults[selectedRecord._id].verified ? <GppGoodIcon color="success" sx={{ mr: 1 }} /> : <ErrorIcon color="error" sx={{ mr: 1 }} />}
                      <Typography variant="subtitle2" color={verificationResults[selectedRecord._id].verified ? "success.main" : "error.main"} sx={{ fontWeight: 700 }}>
                        {verificationResults[selectedRecord._id].message}
                      </Typography>
                    </Box>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Database Integrity</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: verificationResults[selectedRecord._id].databaseIntegrity ? 'success.main' : 'error.main', mb: 1 }}>
                          {verificationResults[selectedRecord._id].databaseIntegrity ? 'PASS' : 'FAIL'}
                        </Typography>
                        
                        <Typography variant="body2" color="text.secondary">Stored Hash</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1, wordBreak: 'break-all' }}>
                          {verificationResults[selectedRecord._id].storedHash || 'N/A'}
                        </Typography>
                        
                        {!verificationResults[selectedRecord._id].databaseIntegrity && (
                          <>
                            <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>Recalculated Hash</Typography>
                            <Typography variant="body2" color="error.main" sx={{ fontFamily: 'monospace', mb: 1, wordBreak: 'break-all' }}>
                              {verificationResults[selectedRecord._id].recalculatedHash || 'N/A'}
                            </Typography>
                          </>
                        )}
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Blockchain Presence</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: verificationResults[selectedRecord._id].blockchainExists ? 'success.main' : 'error.main', mb: 1 }}>
                          {verificationResults[selectedRecord._id].blockchainExists ? 'FOUND ON-CHAIN' : 'NOT FOUND'}
                        </Typography>

                        <Typography variant="body2" color="text.secondary">Transaction Hash</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {verificationResults[selectedRecord._id].transactionHash || 'Not anchored'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                ) : (
                  <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#fafafa' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <ErrorIcon color="action" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700 }}>Verification Pending</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Please click "Verify Integrity" on the main table to cryptographically verify this record against the blockchain.
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary">Stored Data Hash (SHA-256)</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1.5, wordBreak: 'break-all' }}>
                      {selectedRecord.dataHash || selectedRecord.recordHash || 'Not available'}
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary">Transaction Hash (Ganache)</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {selectedRecord.transactionHash || selectedRecord.blockchainHash || 'Not anchored'}
                    </Typography>
                  </Paper>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Button onClick={() => setDetailsOpen(false)} variant="contained" sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
