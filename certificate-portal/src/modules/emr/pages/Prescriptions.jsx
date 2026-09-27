import { useState, useEffect, useCallback } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, Paper, Chip, Divider, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, CircularProgress, Alert, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, MenuItem, IconButton,
} from '@mui/material';
import { Medication, LocalPharmacy, VerifiedUser, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';

const emptyMedication = () => ({ name: '', dosage: '', frequency: '', duration: '' });

const Prescriptions = () => {
    const { role } = useAuth();
    const isDoctor = role === 'doctor';

    const [prescriptions, setPrescriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // ── Doctor-only: create prescription ─────────────────────────────────────
    const [patients, setPatients] = useState([]);
    const [patientsError, setPatientsError] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [newRx, setNewRx] = useState({ patientId: '', instructions: '', medications: [emptyMedication()] });

    const fetchPrescriptions = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/emr/prescriptions');
            // API responses are wrapped as { success, message, data }. Normalize
            // defensively so the state is ALWAYS an array — malformed/unexpected
            // API shapes must never reach `.map()` below and crash the app.
            const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
            setPrescriptions(list);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to load prescriptions.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPrescriptions();
    }, [fetchPrescriptions]);

    // Doctors select the patient from their own authorized patient list — never a hardcoded/free-text id.
    useEffect(() => {
        if (!isDoctor) return;
        const fetchPatients = async () => {
            try {
                const res = await apiFetch('/api/doctor/patients');
                const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                setPatients(list);
            } catch (err) {
                setPatientsError(err.message || 'Failed to load your patients.');
            }
        };
        fetchPatients();
    }, [isDoctor]);

    const openCreateDialog = () => {
        setNewRx({ patientId: '', instructions: '', medications: [emptyMedication()] });
        setFormError('');
        setOpenDialog(true);
    };

    const updateMedication = (idx, field, value) => {
        setNewRx((prev) => ({
            ...prev,
            medications: prev.medications.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
        }));
    };

    const addMedicationRow = () => {
        setNewRx((prev) => ({ ...prev, medications: [...prev.medications, emptyMedication()] }));
    };

    const removeMedicationRow = (idx) => {
        setNewRx((prev) => ({ ...prev, medications: prev.medications.filter((_, i) => i !== idx) }));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!newRx.patientId) {
            setFormError('Please select a patient.');
            return;
        }
        const validMedications = newRx.medications
            .map((m) => ({ ...m, name: m.name.trim(), dosage: m.dosage.trim(), frequency: m.frequency.trim(), duration: m.duration.trim() }))
            .filter((m) => m.name && m.dosage);
        if (validMedications.length === 0) {
            setFormError('Add at least one medication with a name and dosage.');
            return;
        }

        setSubmitting(true);
        try {
            await apiFetch('/api/doctor/prescriptions', {
                method: 'POST',
                body: JSON.stringify({
                    patientId: newRx.patientId,
                    medications: validMedications,
                    instructions: newRx.instructions.trim(),
                }),
            });
            setOpenDialog(false);
            await fetchPrescriptions();
        } catch (err) {
            setFormError(err.message || 'Failed to create prescription.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} />
                <Typography>Loading prescriptions...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocalPharmacy color="success" /> Electronic Prescriptions & Medication History
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Digitally signed electronic prescriptions issued by licensed doctors.
                    </Typography>
                </Box>
                {isDoctor && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                        New Prescription
                    </Button>
                )}
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {isDoctor && patientsError && <Alert severity="warning" sx={{ mb: 3 }}>{patientsError}</Alert>}

            {!error && prescriptions.length === 0 && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No prescriptions available yet.</Typography>
                </Paper>
            )}

            <Grid container spacing={3}>
                {prescriptions.map((rx) => (
                    <Grid item xs={12} key={rx._id}>
                        <Card elevation={2}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Medication color="primary" /> Doctor Prescription
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Issued by: {rx.doctor?.name ? `Dr. ${rx.doctor.name}` : 'Doctor'} | Date: {new Date(rx.createdAt).toLocaleDateString()}
                                        </Typography>
                                    </Box>
                                    <Chip icon={<VerifiedUser />} label="Digitally Signed" color="success" variant="outlined" size="small" />
                                </Box>

                                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                    <Table size="small">
                                        <TableHead sx={{ backgroundColor: 'grey.50' }}>
                                            <TableRow>
                                                <TableCell><strong>Medication Name</strong></TableCell>
                                                <TableCell><strong>Dosage</strong></TableCell>
                                                <TableCell><strong>Frequency</strong></TableCell>
                                                <TableCell><strong>Duration</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(rx.medications || []).map((med, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{med.name}</TableCell>
                                                    <TableCell>{med.dosage}</TableCell>
                                                    <TableCell>{med.frequency}</TableCell>
                                                    <TableCell>{med.duration}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                {rx.instructions && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        <strong>Instructions:</strong> {rx.instructions}
                                    </Typography>
                                )}

                                {rx.digitalSignatureHash && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>
                                        Digital Signature Hash: {rx.digitalSignatureHash}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {isDoctor && (
                <Dialog open={openDialog} onClose={() => !submitting && setOpenDialog(false)} maxWidth="sm" fullWidth>
                    <form onSubmit={handleCreate}>
                        <DialogTitle sx={{ fontWeight: 700 }}>New Prescription</DialogTitle>
                        <DialogContent dividers>
                            {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

                            <TextField
                                select
                                fullWidth
                                required
                                label="Patient"
                                value={newRx.patientId}
                                onChange={(e) => setNewRx((prev) => ({ ...prev, patientId: e.target.value }))}
                                sx={{ mb: 3 }}
                                disabled={submitting}
                                helperText={patients.length === 0 ? 'No authorized patients found.' : ' '}
                            >
                                {patients.map((p) => (
                                    <MenuItem key={p._id} value={p._id}>{p.name} ({p.email})</MenuItem>
                                ))}
                            </TextField>

                            <Typography variant="subtitle2" gutterBottom>Medications</Typography>
                            {newRx.medications.map((med, idx) => (
                                <Grid container spacing={1} key={idx} sx={{ mb: 1.5, alignItems: 'center' }}>
                                    <Grid item xs={12} sm={3}>
                                        <TextField
                                            fullWidth size="small" label="Name" value={med.name} disabled={submitting}
                                            onChange={(e) => updateMedication(idx, 'name', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField
                                            fullWidth size="small" label="Dosage" value={med.dosage} disabled={submitting}
                                            onChange={(e) => updateMedication(idx, 'dosage', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField
                                            fullWidth size="small" label="Frequency" value={med.frequency} disabled={submitting}
                                            onChange={(e) => updateMedication(idx, 'frequency', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={5} sm={2}>
                                        <TextField
                                            fullWidth size="small" label="Duration" value={med.duration} disabled={submitting}
                                            onChange={(e) => updateMedication(idx, 'duration', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={1}>
                                        <IconButton
                                            size="small"
                                            onClick={() => removeMedicationRow(idx)}
                                            disabled={submitting || newRx.medications.length === 1}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Grid>
                                </Grid>
                            ))}
                            <Button size="small" startIcon={<AddIcon />} onClick={addMedicationRow} disabled={submitting} sx={{ mb: 3 }}>
                                Add Medication
                            </Button>

                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Instructions (optional)"
                                value={newRx.instructions}
                                onChange={(e) => setNewRx((prev) => ({ ...prev, instructions: e.target.value }))}
                                disabled={submitting}
                            />
                        </DialogContent>
                        <DialogActions sx={{ p: 2 }}>
                            <Button onClick={() => setOpenDialog(false)} disabled={submitting}>Cancel</Button>
                            <Button type="submit" variant="contained" disabled={submitting}>
                                {submitting ? 'Saving...' : 'Create Prescription'}
                            </Button>
                        </DialogActions>
                    </form>
                </Dialog>
            )}
        </Box>
    );
};

export default Prescriptions;
