import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, Paper, Grid, Chip, Divider, List, ListItem, ListItemText } from '@mui/material';
import { Event, CalendarMonth, AccessTime, Person } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const Appointments = () => {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const data = await apiFetch('/api/emr/appointments');
                setAppointments(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalendarMonth color="primary" /> Doctor Appointments & Consultation Visits
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Schedule, manage, and review doctor consultation appointments and visit notes.
                </Typography>
            </Paper>

            <Card elevation={2}>
                <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Event /> Scheduled & Past Visits ({appointments.length})
                    </Typography>
                    <Divider sx={{ my: 2 }} />

                    {appointments.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                            No appointments found.
                        </Typography>
                    ) : (
                        <Grid container spacing={2}>
                            {appointments.map((apt) => (
                                <Grid item xs={12} md={6} key={apt._id}>
                                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {apt.reason}
                                            </Typography>
                                            <Chip
                                                label={apt.status.toUpperCase()}
                                                color={apt.status === 'completed' ? 'success' : 'primary'}
                                                size="small"
                                            />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary">
                                            Doctor: {apt.doctor?.name ? `Dr. ${apt.doctor.name}` : 'Assigned Doctor'} ({apt.doctor?.specialty || 'General'})
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Patient: {apt.patient?.name || 'Patient'}
                                        </Typography>
                                        <Typography variant="caption" display="block" color="primary" sx={{ mt: 1 }}>
                                            📅 {new Date(apt.appointmentDate).toLocaleDateString()} at {apt.timeSlot}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default Appointments;
