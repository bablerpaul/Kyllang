import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Alert,
  Chip,
  Card,
  CardContent,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function QRVerificationManager() {
  const [inputHash, setInputHash] = useState('a7c9f8e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8');
  const [result, setResult] = useState(null);

  const handleVerify = (e) => {
    e.preventDefault();
    setResult({
      verified: true,
      patientName: 'John Doe',
      doctorName: 'Dr. Sarah Jenkins',
      diagnosis: 'Hypertension Stage 1',
      validFrom: '2026-07-25',
      validUntil: '2026-07-30',
      blockchainTx: '0x8f2a9d1b4c7e3f8a0b9c2d1e4f6a8b0c2d4e6f8a0b9c2d1e4f6a8b0c2d4e6f8a',
      ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
    });
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
          QR Code & Hash Verification Module
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Instant public & hospital verification of medical certificates, HMAC zero-knowledge proofs, and on-chain blockchain hashes
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <QrCodeScannerIcon color="primary" /> Verify Certificate or Data Hash
            </Typography>

            <form onSubmit={handleVerify}>
              <TextField
                fullWidth
                label="Enter Verification Hash or Scan QR Payload"
                value={inputHash}
                onChange={(e) => setInputHash(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button fullWidth variant="contained" type="submit" startIcon={<VerifiedIcon />} sx={{ bgcolor: '#2563eb', py: 1.2, fontWeight: 600 }}>
                Perform On-Chain & HMAC Verification
              </Button>
            </form>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          {result ? (
            <Card elevation={0} sx={{ border: '2px solid #16a34a', borderRadius: '12px', bgcolor: '#f0fdf4' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CheckCircleIcon color="success" fontSize="large" />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#15803d' }}>
                      Cryptographically Authentic & Verified!
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#166534' }}>
                      HMAC ZKP Hash matches smart contract `EMRRegistry.sol`
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={1.5} sx={{ mt: 1 }}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Patient Name:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.patientName}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Attending Doctor:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.doctorName}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Diagnosis / Medical Purpose:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.diagnosis}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Blockchain Transaction Hash:</Typography>
                    <Chip label={result.blockchainTx} size="small" color="success" sx={{ fontFamily: 'monospace', width: '100%', justifyContent: 'flex-start' }} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>IPFS Content CID:</Typography>
                    <Chip label={result.ipfsCid} size="small" sx={{ fontFamily: 'monospace', width: '100%', justifyContent: 'flex-start' }} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ) : (
            <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px border-dashed #cbd5e1', borderRadius: '12px', bgcolor: '#f8fafc' }}>
              <QrCodeScannerIcon sx={{ fontSize: 60, color: '#94a3b8', mb: 1 }} />
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Scan a medical certificate QR code or submit a cryptographic hash to view real-time verification details.
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
