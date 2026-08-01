import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Grid, Paper, Chip, Divider } from '@mui/material';
import { Science, Assessment, CheckCircle } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const LabReports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const data = await apiFetch('/api/emr/lab-reports');
                setReports(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#fff3e0', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Science color="warning" /> Diagnostic & Laboratory Reports
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    View diagnostic test orders, laboratory results, and pathology findings.
                </Typography>
            </Paper>

            <Grid container spacing={3}>
                {reports.map((report) => (
                    <Grid item xs={12} md={6} key={report._id}>
                        <Card elevation={2}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Assessment color="primary" /> {report.testName}
                                    </Typography>
                                    <Chip label={report.status.toUpperCase()} color="success" size="small" icon={<CheckCircle />} />
                                </Box>
                                <Chip label={report.testCategory} variant="outlined" size="small" sx={{ mb: 2 }} />

                                <Typography variant="body2" color="text.secondary" paragraph>
                                    <strong>Results Summary:</strong> {report.resultsSummary}
                                </Typography>

                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary" display="block">
                                    Ordered By: {report.orderedBy?.name ? `Dr. ${report.orderedBy.name}` : 'Physician'} | Date: {new Date(report.createdAt).toLocaleDateString()}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default LabReports;
