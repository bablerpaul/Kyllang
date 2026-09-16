import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import axios from 'axios';

export default function EmergencyAccessManager() {
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emergencyData, setEmergencyData] = useState(null);

  const handleEmergencyRequest = async (e) => {
    e.preventDefault();
    if (!patientId || !reason) {
      setError('Patient ID and Reason are strictly required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setEmergencyData(null);

    try {
      // Typically, an MCI (Mass Casualty Incident) or emergency request is logged on-chain.
      // We simulate hitting the new /api/emergency endpoint.
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/emergency/trigger', 
        { patientId, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSuccess('Emergency Access Granted. Action logged immutably on blockchain.');
        setEmergencyData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to trigger emergency mode.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Server error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon fontSize="large" /> Emergency "Break-Glass" Access
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b', mt: 1 }}>
          Critical override for immediate access to life-saving Electronic Medical Records. 
          <strong> WARNING: All access is logged on the blockchain and subject to strict post-incident audit.</strong>
        </Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 4, border: '2px solid #ef4444', borderRadius: '12px', bgcolor: '#fef2f2' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#991b1b', mb: 3 }}>
              Trigger Emergency Decryption
            </Typography>

            <form onSubmit={handleEmergencyRequest}>
              <TextField
                fullWidth
                label="Target Patient ID / Wallet Address"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                sx={{ mb: 3 }}
                variant="outlined"
                color="error"
              />
              <TextField
                fullWidth
                label="Clinical Justification (e.g., Unconscious trauma patient)"
                multiline
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                sx={{ mb: 3 }}
                variant="outlined"
                color="error"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="error"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LocalHospitalIcon />}
                sx={{ py: 1.5, fontWeight: 700, fontSize: '1.1rem' }}
              >
                AUTHORIZE EMERGENCY OVERRIDE
              </Button>
            </form>

            {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 3 }}>{success}</Alert>}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          {emergencyData ? (
            <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Decrypted Emergency Record
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Blood Type & Allergies</Typography>
                  <Typography variant="body1" fontWeight="600" color="error.main">
                    {emergencyData.criticalInfo || 'O- Positive | PENICILLIN ALLERGY'}
                  </Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Recent Diagnoses</Typography>
                  <Typography variant="body2">
                    {emergencyData.diagnoses || 'No major recent diagnoses found.'}
                  </Typography>
                </Box>

                <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Blockchain Audit Trail</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    TX: {emergencyData.txHash || '0xab12... (Awaiting confirmation)'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ) : (
             <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#94a3b8' }}>
               <LocalHospitalIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
               <Typography variant="body1" align="center">
                 Decrypted emergency records will appear here upon authorization.
               </Typography>
             </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
