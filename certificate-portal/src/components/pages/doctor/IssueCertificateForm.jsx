import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Button, Grid, Alert, Typography, Box, Stepper, Step, StepLabel,
    CircularProgress, Paper
} from '@mui/material';
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import { computeCommitment, generateSalt } from '../../../utils/poseidonUtils';
import { encryptKeyWithX25519 } from '../../../utils/cryptoUtils';

const steps = ['Certificate Details', 'Review', 'Success'];

const IssueCertificateForm = ({ open, onClose, patient }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [formData, setFormData] = useState({
        diagnosis: '',
        remarks: '',
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successData, setSuccessData] = useState(null);

    const handleChange = (field) => (event) => {
        setFormData((prev) => ({ ...prev, [field]: event.target.value }));
        setError('');
    };

    const handleNext = () => {
        if (activeStep === 0) {
            if (!formData.diagnosis || !formData.validFrom || !formData.validUntil) {
                setError('Please fill in all required fields.');
                return;
            }
            if (new Date(formData.validUntil) < new Date(formData.validFrom)) {
                setError('Valid Until date cannot be before Valid From date.');
                return;
            }
        }
        setActiveStep((prev) => prev + 1);
        setError('');
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
        setError('');
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError('');

        try {
            if (!patient?._id) throw new Error("Patient context is missing.");

            // 1. Generate cryptographic salt
            const saltHex = generateSalt();

            // 2. Compute Poseidon4 commitment hash
            const publicCommitmentHash = await computeCommitment(
                patient._id,
                formData.diagnosis,
                new Date(formData.validFrom).getTime() / 1000,
                saltHex
            );

            const resolvedPublicKey = patient.publicKey || patient.user?.publicKey;
            if (!resolvedPublicKey) {
                throw new Error('Patient does not have an encryption public key for credential delivery.');
            }

            const encryptedCredential = encryptKeyWithX25519(JSON.stringify({
                patientId: patient._id,
                diagnosisCode: formData.diagnosis,
                validFrom: new Date(formData.validFrom).getTime() / 1000,
                validUntil: new Date(formData.validUntil).getTime() / 1000,
                secretSalt: saltHex,
                commitment: publicCommitmentHash,
            }), resolvedPublicKey);

            // 3. Submit to the new ZKP API endpoint
            const res = await apiFetch('/api/certificates', {
                method: 'POST',
                body: JSON.stringify({
                    patientId: patient._id,
                    publicCommitmentHash,
                    validFrom: new Date(formData.validFrom).toISOString(),
                    validUntil: new Date(formData.validUntil).toISOString(),
                    remarks: formData.remarks,
                    encryptedCredential,
                })
            });

            if (!res.success) throw new Error(res.message || 'Failed to issue certificate');

            setSuccessData(res.data);
            setActiveStep(2);
        } catch (err) {
            console.error(err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (activeStep === 2) {
            onClose(true); // Success
        } else {
            onClose(false);
        }
        
        // Reset state after a short delay
        setTimeout(() => {
            setActiveStep(0);
            setSuccessData(null);
            setFormData({
                diagnosis: '',
                remarks: '',
                validFrom: new Date().toISOString().split('T')[0],
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            });
        }, 300);
    };

    return (
        <Dialog open={open} onClose={isSubmitting ? null : handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Issue Medical Certificate</DialogTitle>
            <DialogContent dividers>
                <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {activeStep === 0 && (
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                Patient: <strong>{patient?.name}</strong> ({patient?._id})
                            </Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Diagnosis / Clinical Purpose"
                                value={formData.diagnosis}
                                onChange={handleChange('diagnosis')}
                                required
                                helperText="This will be encrypted and hidden from the public blockchain via ZKP."
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Remarks / Recommendations"
                                value={formData.remarks}
                                onChange={handleChange('remarks')}
                                helperText="General remarks. This may be visible on the generated certificate."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Valid From"
                                InputLabelProps={{ shrink: true }}
                                value={formData.validFrom}
                                onChange={handleChange('validFrom')}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Valid Until"
                                InputLabelProps={{ shrink: true }}
                                value={formData.validUntil}
                                onChange={handleChange('validUntil')}
                                required
                            />
                        </Grid>
                    </Grid>
                )}

                {activeStep === 1 && (
                    <Box>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Please review the certificate details. Once issued, it will be permanently anchored to the CertificateRegistry smart contract.
                        </Alert>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fafafa' }}>
                            <Grid container spacing={2}>
                                <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Patient:</Typography></Grid>
                                <Grid item xs={8}><Typography variant="body2">{patient?.name}</Typography></Grid>
                                
                                <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Diagnosis:</Typography></Grid>
                                <Grid item xs={8}><Typography variant="body2">{formData.diagnosis}</Typography></Grid>
                                
                                <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Valid Dates:</Typography></Grid>
                                <Grid item xs={8}><Typography variant="body2">{formData.validFrom} to {formData.validUntil}</Typography></Grid>
                                
                                <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Remarks:</Typography></Grid>
                                <Grid item xs={8}><Typography variant="body2">{formData.remarks || 'None'}</Typography></Grid>
                            </Grid>
                        </Paper>
                    </Box>
                )}

                {activeStep === 2 && successData && (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
                        <Typography variant="h5" gutterBottom>Certificate Issued Successfully</Typography>
                        
                        <Paper variant="outlined" sx={{ p: 2, mt: 3, textAlign: 'left', bgcolor: '#f5fcf5' }}>
                            <Typography variant="subtitle2" color="text.secondary">ZK Commitment Hash:</Typography>
                            <Typography variant="caption" sx={{ wordBreak: 'break-all', fontFamily: 'monospace', mb: 1, display: 'block' }}>
                                {successData.publicCommitmentHash}
                            </Typography>

                            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Blockchain TX:</Typography>
                            <Typography variant="caption" sx={{ wordBreak: 'break-all', fontFamily: 'monospace', display: 'block' }}>
                                {successData.blockchainTxHash}
                            </Typography>
                        </Paper>
                        
                        <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>
                            Note: The cryptographic salt and diagnosis must be communicated to the patient through secure channels. Do not expose them publicly.
                        </Alert>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                {activeStep === 0 && (
                    <>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button variant="contained" onClick={handleNext}>Review</Button>
                    </>
                )}
                {activeStep === 1 && (
                    <>
                        <Button onClick={handleBack} disabled={isSubmitting}>Back</Button>
                        <Button 
                            variant="contained" 
                            color="primary" 
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {isSubmitting ? 'Issuing & Anchoring...' : 'Issue Certificate'}
                        </Button>
                    </>
                )}
                {activeStep === 2 && (
                    <Button variant="contained" onClick={handleClose}>Close</Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default IssueCertificateForm;
