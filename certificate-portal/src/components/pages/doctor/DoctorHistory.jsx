import React from 'react';
import { Box, Typography, Paper, Alert, Card, CardContent, List, ListItem, ListItemText } from '@mui/material';
import { History as HistoryIcon, AccessTime as AccessTimeIcon } from '@mui/icons-material';

const DoctorHistory = () => {
    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon /> Activity History
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Review your recent actions and portal activity history.
                </Typography>
            </Paper>

            {/* Recent Activity */}
            <Card elevation={2} sx={{ mt: 3 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccessTimeIcon /> Recent Activity Log
                    </Typography>
                    <List dense>
                        {[
                            { action: 'Viewed John Doe\'s profile', time: '2 hours ago' },
                            { action: 'Requested access to vaccine certificate', time: '1 day ago' },
                            { action: 'Updated treatment plan for Jane Smith', time: '2 days ago' },
                            { action: 'Granted access to blood test results', time: '3 days ago' }
                        ].map((activity, index) => (
                            <ListItem key={index}>
                                <ListItemText
                                    primary={activity.action}
                                    secondary={activity.time}
                                />
                            </ListItem>
                        ))}
                    </List>

                    <Alert severity="info" sx={{ mt: 2 }}>
                        The full history tracking feature is currently operating on mock data.
                    </Alert>
                </CardContent>
            </Card>
        </Box>
    );
};

export default DoctorHistory;
