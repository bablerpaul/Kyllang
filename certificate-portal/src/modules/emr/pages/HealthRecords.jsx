import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Divider, Paper, Button, CircularProgress, Alert } from '@mui/material';
import { LocalHospital, Assignment, Speed, Timeline, MedicalInformation, VerifiedUser, SecurityUpdateWarning, Error as ErrorIcon } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const HealthRecords = () => {
    const [record, setRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    const [verifyingId, setVerifyingId] = useState(null);
    const [verificationResults, setVerificationResults] = useState({});

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

    const handleVerify = async (id) => {
        setVerifyingId(id);
        try {
            const res = await apiFetch(`/api/emr/${id}/verify`);
            setVerificationResults(prev => ({
                ...prev,
                [id]: res
            }));
        } catch (err) {
            console.error(err);
            setVerificationResults(prev => ({
                ...prev,
                [id]: { verified: false, message: 'VERIFICATION FAILED API ERROR' }
            }));
        } finally {
            setVerifyingId(null);
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} />
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
                    Comprehensive patient medical history, allergies, chronic conditions, and clinical encounter history.
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
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.bloodPressure || 'Not provided'}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Heart Rate:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.heartRate ? `${record.vitals.heartRate} bpm` : 'Not provided'}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Body Temp:</Typography>
                                <Typography variant="body1" fontWeight="bold">{record?.vitals?.temperature ? `${record.vitals.temperature} °F` : 'Not provided'}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Weight / Height:</Typography>
                                <Typography variant="body1" fontWeight="bold">
                                    {record?.vitals?.weight ? `${record.vitals.weight} kg` : 'Not provided'} / {record?.vitals?.height ? `${record.vitals.height} cm` : 'Not provided'}
                                </Typography>
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
                                <Chip label={record?.bloodGroup || 'Not provided'} color={record?.bloodGroup ? 'error' : 'default'} variant="contained" sx={{ fontWeight: 'bold' }} />
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Known Allergies:</Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {(!record?.allergies || record.allergies.length === 0) ? (
                                        <Typography variant="body2" color="text.secondary">No allergies recorded</Typography>
                                    ) : (
                                        record.allergies.map((allergy, idx) => (
                                            <Chip key={idx} label={allergy} color="warning" variant="outlined" size="small" />
                                        ))
                                    )}
                                </Box>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Chronic Conditions:</Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {(!record?.chronicConditions || record.chronicConditions.length === 0) ? (
                                        <Typography variant="body2" color="text.secondary">No chronic conditions recorded</Typography>
                                    ) : (
                                        record.chronicConditions.map((cond, idx) => (
                                            <Chip key={idx} label={cond} color="info" variant="outlined" size="small" />
                                        ))
                                    )}
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Diagnosed Medical History:</Typography>
                            {(!record?.medicalHistory || record.medicalHistory.length === 0) ? (
                                <Typography variant="body2" color="text.secondary">No medical history recorded</Typography>
                            ) : (
                                record.medicalHistory.map((hist, idx) => (
                                    <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1, backgroundColor: '#fafafa' }}>
                                        <Typography variant="subtitle2">{hist.condition}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Diagnosed: {new Date(hist.diagnosedDate).toLocaleDateString()} | Status: {hist.status}
                                        </Typography>
                                    </Paper>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* EMR History Section */}
                <Grid item xs={12}>
                    <Typography variant="h5" sx={{ mt: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Timeline color="primary" /> EMR Encounter History
                    </Typography>
                    
                    {(!record?.emrHistory || record.emrHistory.length === 0) ? (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">No clinical records available yet.</Typography>
                        </Paper>
                    ) : (
                        record.emrHistory.map((emr) => (
                            <Card key={emr._id} elevation={3} sx={{ mb: 3, borderLeft: '4px solid #1976d2' }}>
                                <CardContent>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={8}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                                <Box>
                                                    <Typography variant="h6" color="primary.main">
                                                        {new Date(emr.visitDate).toLocaleDateString()} - {emr.diagnosis || 'No Diagnosis'}
                                                    </Typography>
                                                    <Typography variant="subtitle2" color="text.secondary">
                                                        Attending: {emr.doctor?.user?.name || 'Unknown Doctor'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            
                                            <Divider sx={{ my: 2 }} />
                                            
                                            <Grid container spacing={2}>
                                                <Grid item xs={12} sm={6}>
                                                    <Typography variant="subtitle2" color="text.secondary">Symptoms</Typography>
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                        {emr.symptoms && emr.symptoms.length > 0 ? emr.symptoms.join(', ') : 'Not provided'}
                                                    </Typography>
                                                    
                                                    <Typography variant="subtitle2" color="text.secondary">Encounter Vitals</Typography>
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                        BP: {emr.vitalSigns?.bloodPressure || emr.vitals?.bloodPressure || 'N/A'} | 
                                                        HR: {emr.vitalSigns?.heartRate || emr.vitals?.heartRate || 'N/A'} | 
                                                        Temp: {emr.vitalSigns?.temperature || emr.vitals?.temperature || 'N/A'}
                                                    </Typography>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <Typography variant="subtitle2" color="text.secondary">Medications</Typography>
                                                    {emr.medications && emr.medications.length > 0 ? (
                                                        <Box sx={{ mb: 1 }}>
                                                            {emr.medications.map((med, i) => (
                                                                <Typography key={i} variant="body2">
                                                                    • {med.name} {med.dosage && `(${med.dosage})`}
                                                                </Typography>
                                                            ))}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>Not provided</Typography>
                                                    )}

                                                    <Typography variant="subtitle2" color="text.secondary">Clinical Notes</Typography>
                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                        {emr.clinicalNotes || 'Not provided'}
                                                    </Typography>
                                                </Grid>
                                            </Grid>
                                        </Grid>

                                        {/* Blockchain & Integrity Section */}
                                        <Grid item xs={12} md={4}>
                                            <Paper elevation={0} sx={{ p: 2, bgcolor: '#f8fafc', height: '100%', border: '1px solid #e2e8f0' }}>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <MedicalInformation fontSize="small" /> Cryptographic Anchor
                                                </Typography>
                                                
                                                <Box sx={{ mb: 2 }}>
                                                    <Typography variant="caption" color="text.secondary" display="block">Data Hash (SHA-256)</Typography>
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: 'block' }}>
                                                        {emr.dataHash || 'Not provided'}
                                                    </Typography>
                                                </Box>
                                                
                                                <Box sx={{ mb: 2 }}>
                                                    <Typography variant="caption" color="text.secondary" display="block">Transaction Hash</Typography>
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: 'block' }}>
                                                        {emr.transactionHash || emr.blockchainHash || 'Not blockchain verified'}
                                                    </Typography>
                                                </Box>

                                                <Box sx={{ mt: 2 }}>
                                                    {verificationResults[emr._id] ? (
                                                        <Alert 
                                                            severity={verificationResults[emr._id].verified ? "success" : "error"}
                                                            icon={verificationResults[emr._id].verified ? <VerifiedUser /> : (verificationResults[emr._id].message === 'BLOCKCHAIN RECORD NOT FOUND' ? <SecurityUpdateWarning /> : <ErrorIcon />)}
                                                            sx={{ py: 0, px: 1, '& .MuiAlert-message': { p: 1 } }}
                                                        >
                                                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                                                {verificationResults[emr._id].verified ? '✓ VERIFIED' : `⚠ ${verificationResults[emr._id].message}`}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                DB Integrity: {verificationResults[emr._id].databaseIntegrity ? 'PASS' : 'FAIL'}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                Blockchain Anchor: {verificationResults[emr._id].blockchainExists ? 'PASS' : (verificationResults[emr._id].transactionHash ? 'FAIL' : 'N/A')}
                                                            </Typography>
                                                        </Alert>
                                                    ) : (
                                                        <Button 
                                                            variant="outlined" 
                                                            size="small" 
                                                            fullWidth
                                                            onClick={() => handleVerify(emr._id)}
                                                            disabled={verifyingId === emr._id}
                                                        >
                                                            {verifyingId === emr._id ? <CircularProgress size={20} /> : 'Verify Integrity'}
                                                        </Button>
                                                    )}
                                                </Box>
                                            </Paper>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </Grid>
            </Grid>
        </Box>
    );
};

export default HealthRecords;
