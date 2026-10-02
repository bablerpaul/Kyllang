import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, FormControl, InputLabel, Select, MenuItem, Box, Alert
} from '@mui/material';
import { apiFetch } from '../../../utils/api';

const RequestCertificateCreationForm = ({ open, onClose, patient }) => {
    const [certificateType, setCertificateType] = useState('general');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!reason.trim()) {
            setError('Reason is required');
            return;
        }

        try {
            setLoading(true);
            await apiFetch('/api/doctor/certificate-requests', {
                method: 'POST',
                body: JSON.stringify({
                    patientId: patient?._id,
                    certificateType,
                    reason: reason.trim()
                })
            });
            onClose(true);
        } catch (err) {
            setError(err.message || 'Failed to create certificate request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !loading && onClose(false)} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>Request Certificate Creation</DialogTitle>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    
                    <Box sx={{ mb: 2, mt: 1 }}>
                        <FormControl fullWidth margin="normal">
                            <InputLabel id="certificate-type-label">Certificate Type</InputLabel>
                            <Select
                                labelId="certificate-type-label"
                                value={certificateType}
                                label="Certificate Type"
                                onChange={(e) => setCertificateType(e.target.value)}
                                disabled={loading}
                            >
                                <MenuItem value="general">General</MenuItem>
                                <MenuItem value="vaccine">Vaccine</MenuItem>
                                <MenuItem value="age_verification">Age Verification</MenuItem>
                            </Select>
                        </FormControl>
                        
                        <TextField
                            margin="normal"
                            label="Reason for Request"
                            type="text"
                            fullWidth
                            multiline
                            rows={4}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => onClose(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="contained" color="primary" disabled={loading}>
                        {loading ? 'Submitting...' : 'Submit Request'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default RequestCertificateCreationForm;
