import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Divider, Paper, Button, TextField, Alert } from '@mui/material';
import { LocalHospital, Favorite, DeviceThermostat as Thermometer, FitnessCenter, Assignment, Speed } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const HealthRecords = () => {
    const [record, setRecord] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecord = async () => {
            try {
                const data = await apiFetch('/api/emr/records');
                setRecord(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchRecord();
    }, []);

    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography>Loading health records...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalHospital color="primary" /> Electronic Health Record (EHR)
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Comprehensive patient medical history, allergies, chronic conditions, and vital stats.
                </Typography>
            </Paper>

            <Grid container spacing={3}>
                {/* Vitals Summary Card */}
                <Grid item xs={12} md={4}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Speed color="primary" /> Current Vitals
                            </Typography>
                            <Divider sx={{ my: 1.5 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Blood Pressure:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.bloodPressure || '120/80'}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Heart Rate:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.heartRate || 72} bpm</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Body Temp:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.temperature || 98.6} °F</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Weight / Height:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.weight || 70} kg / {record?.vitals?.height || 175} cm</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Patient Demographics & Profile */}
                <Grid item xs={12} md={8}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Assignment color="primary" /> Medical Profile
                            </Typography>
                            <Divider sx={{ my: 1.5 }} />
                            
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Blood Group:</Typography>
                                <Chip label={record?.bloodGroup || 'O+'} color="error" variant="contained" sx={{ fontWeight: 'bold' }} />
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Known Allergies:</Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {(record?.allergies || ['Penicillin']).map((allergy, idx) => (
                                        <Chip key={idx} label={allergy} color="warning" variant="outlined" size="small" />
                                    ))}
                                </Box>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Chronic Conditions:</Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {(record?.chronicConditions || ['Hypertension']).map((cond, idx) => (
                                        <Chip key={idx} label={cond} color="info" variant="outlined" size="small" />
                                    ))}
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Diagnosed Medical History:</Typography>
                            {(record?.medicalHistory || []).map((hist, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1, backgroundColor: '#fafafa' }}>
                                    <Typography variant="subtitle2">{hist.condition}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Diagnosed: {new Date(hist.diagnosedDate).toLocaleDateString()} | Status: {hist.status}
                                    </Typography>
                                </Paper>
                            ))}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default HealthRecords;
