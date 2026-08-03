import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Grid,
    Alert
} from '@mui/material';
import { apiFetch } from '../../../utils/api';

const IssueCertificateForm = ({ open, onClose, patient }) => {
    const [formData, setFormData] = useState({
        diagnosis: '',
        remarks: '',
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (field) => (event) => {
        setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const submitData = new FormData();
            submitData.append('patientId', patient?._id);
            submitData.append('diagnosis', formData.diagnosis);
            submitData.append('remarks', formData.remarks);
            submitData.append('validFrom', formData.validFrom);
            submitData.append('validUntil', formData.validUntil);
            
            if (file) {
                submitData.append('file', file);
            }

            // Note: If using a custom apiFetch that sets 'Content-Type': 'application/json' automatically, 
            // you might need to use standard fetch or adjust apiFetch to not set headers if body is FormData
            // Usually, fetch sets multipart/form-data boundary automatically when body is FormData.
            const res = await apiFetch('/api/doctor/certificates', {
                method: 'POST',
                body: submitData
            });

            alert(`✅ Certificate issued successfully!\nVerification Hash: ${res.verificationHash}\n\nPatient can now view and download it.`);
            onClose(true);
            setFormData({
                diagnosis: '',
                remarks: '',
                validFrom: new Date().toISOString().split('T')[0],
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            });
        } catch (error) {
            console.error(error);
            alert(`Failed to issue certificate: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Issue Medical Certificate</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent dividers>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Diagnosis"
                                value={formData.diagnosis}
                                onChange={handleChange('diagnosis')}
                                required
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
                        <Grid item xs={12}>
                            <Button
                                variant="outlined"
                                component="label"
                                fullWidth
                            >
                                Upload Physical Certificate (Optional)
                                <input
                                    type="file"
                                    hidden
                                    onChange={(e) => setFile(e.target.files[0])}
                                />
                            </Button>
                            {file && <Typography variant="body2" sx={{ mt: 1 }}>{file.name}</Typography>}
                        </Grid>
                    </Grid>
                    <Alert severity="info" sx={{ mt: 3 }}>
                        A verified QR code will be generated containing a cryptographic hash of this certificate for authenticating it later.
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => onClose(false)}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting || !formData.diagnosis}>
                        {isSubmitting ? 'Issuing...' : 'Issue Certificate'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default IssueCertificateForm;
