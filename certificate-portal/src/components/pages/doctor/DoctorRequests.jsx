import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Alert, List, ListItem, ListItemText, Chip, Button, Card, CardContent } from '@mui/material';
import { Notifications as NotificationsIcon, CalendarToday as CalendarIcon } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import CertificateRequests from './CertificateRequests';

const DoctorRequests = () => {
    const [pendingRequests, setPendingRequests] = useState([]);

    useEffect(() => {
        // Load pending requests from localStorage (mock feature until api docs)
        const requests = JSON.parse(localStorage.getItem('doctor_access_requests') || '[]');
        const pending = requests.filter(req => req.status === 'pending');
        setPendingRequests(pending);
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalendarIcon /> Document & Certificate Requests
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Review and respond to incoming requests from your patients.
                </Typography>
            </Paper>

            {/* Pending Access Requests */}
            <Card elevation={3} sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <NotificationsIcon /> Pending Document Access Requests
                    </Typography>

                    {pendingRequests.length === 0 ? (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            No pending requests. All requests have been approved.
                        </Alert>
                    ) : (
                        <List dense>
                            {pendingRequests.slice(0, 3).map((request) => (
                                <ListItem key={request.id}>
                                    <ListItemText
                                        primary={request.documentName}
                                        secondary={
                                            <>
                                                <Typography variant="caption" component="div">
                                                    Patient: {request.patientName}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Requested: {new Date(request.requestDate).toLocaleDateString()}
                                                </Typography>
                                            </>
                                        }
                                    />
                                    <Chip label="Pending" size="small" color="warning" />
                                </ListItem>
                            ))}
                        </List>
                    )}

                    {pendingRequests.length > 0 && (
                        <Button fullWidth sx={{ mt: 2 }} component={Link} to="#">
                            View All Requests ({pendingRequests.length})
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Certificate Requests List */}
            <CertificateRequests />

            {/* Quick Tips */}
            <Alert severity="info" sx={{ mt: 4 }}>
                <Typography variant="body2">
                    <strong>Tip:</strong> Patients must approve document access requests.
                    Once approved, documents become available in the "Granted Access" tab of patient details.
                </Typography>
            </Alert>
        </Box>
    );
};

export default DoctorRequests;
