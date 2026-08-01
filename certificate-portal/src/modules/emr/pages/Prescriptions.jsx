import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Grid, Paper, Chip, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Medication, LocalPharmacy, VerifiedUser } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const Prescriptions = () => {
    const [prescriptions, setPrescriptions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPrescriptions = async () => {
            try {
                const data = await apiFetch('/api/emr/prescriptions');
                setPrescriptions(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchPrescriptions();
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#e8f5e9', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalPharmacy color="success" /> Electronic Prescriptions & Medication History
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Digitally signed electronic prescriptions issued by licensed doctors.
                </Typography>
            </Paper>

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
                                        <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
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
        </Box>
    );
};

export default Prescriptions;
