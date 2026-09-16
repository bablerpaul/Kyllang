import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import { apiFetch } from '../../../utils/api';

export default function CreateEMRDialog({ open, onClose, appointment, onCreated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const [formData, setFormData] = useState({
    diagnosis: '',
    symptoms: '',
    bloodPressure: '120/80',
    heartRate: '72',
    temperature: '98.6',
    clinicalNotes: '',
  });

  useEffect(() => {
    if (open) {
      setFormData({
        diagnosis: '',
        symptoms: '',
        bloodPressure: '120/80',
        heartRate: '72',
        temperature: '98.6',
        clinicalNotes: '',
      });
      setError(null);
      setSuccessData(null);
      setLoading(false);
    }
  }, [open]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      appointmentId: appointment?._id,
      patientId: appointment?.patient?._id || appointment?.patient,
      diagnosis: formData.diagnosis,
      symptoms: formData.symptoms ? formData.symptoms.split(',').map((s) => s.trim()) : [],
      vitals: {
        bloodPressure: formData.bloodPressure,
        heartRate: Number(formData.heartRate),
        temperature: Number(formData.temperature),
      },
      clinicalNotes: formData.clinicalNotes,
    };

    try {
      const res = await apiFetch('/api/emr', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res?.success) {
        setSuccessData(res.data);
        if (onCreated) {
          onCreated(res.data);
        }
      } else {
        setError(res?.message || 'Failed to create EMR');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during EMR creation');
    } finally {
      setLoading(false);
    }
  };

  const getPatientName = () => {
    return appointment?.patient?.user?.name || appointment?.patient?.name || appointment?.patientName || 'Unknown Patient';
  };

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="md" fullWidth>
      {successData ? (
        <>
          <DialogTitle sx={{ fontWeight: 700, color: 'success.main' }}>EMR Created Successfully</DialogTitle>
          <DialogContent dividers>
            <Alert severity="success" sx={{ mb: 3 }}>
              The clinical encounter has been saved and anchored to the blockchain.
            </Alert>
            <Typography variant="subtitle2" color="text.secondary">Transaction Hash (Blockchain):</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all', mb: 2, fontFamily: 'monospace' }}>
              {successData.transactionHash}
            </Typography>
            <Typography variant="subtitle2" color="text.secondary">Data Hash (SHA-256):</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {successData.dataHash}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} variant="contained" color="primary">
              Close
            </Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            Create Clinical Encounter
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">Patient</Typography>
              <Typography variant="h6">{getPatientName()}</Typography>
              {appointment?.reason && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Reason for Visit</Typography>
                  <Typography variant="body2">{appointment.reason}</Typography>
                </>
              )}
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ fontSize: '1rem', mb: 1 }}>Diagnosis & Symptoms</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Diagnosis (Required)"
                  name="diagnosis"
                  value={formData.diagnosis}
                  onChange={handleChange}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Symptoms (Comma separated)"
                  name="symptoms"
                  value={formData.symptoms}
                  onChange={handleChange}
                  placeholder="e.g., Fever, Cough, Headache"
                />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="h6" sx={{ fontSize: '1rem', mb: 1 }}>Vital Signs</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Blood Pressure"
                  name="bloodPressure"
                  value={formData.bloodPressure}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  type="number"
                  label="Heart Rate (bpm)"
                  name="heartRate"
                  value={formData.heartRate}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  type="number"
                  inputProps={{ step: "0.1" }}
                  label="Temperature (°F)"
                  name="temperature"
                  value={formData.temperature}
                  onChange={handleChange}
                />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="h6" sx={{ fontSize: '1rem', mb: 1 }}>Clinical Notes</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Clinical Notes / Treatment Plan"
                  name="clinicalNotes"
                  value={formData.clinicalNotes}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading || !formData.diagnosis}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? 'Saving to Blockchain...' : 'Create EMR'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
