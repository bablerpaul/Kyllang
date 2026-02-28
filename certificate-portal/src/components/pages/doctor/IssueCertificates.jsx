import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { MedicalServices as MedicalServicesIcon } from '@mui/icons-material';
import IssueCertificateForm from './IssueCertificateForm';

const IssueCertificates = () => {
    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MedicalServicesIcon /> Issue Certificates
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Issue Medical certificates in accordance with patient requests submitted through the designated request option.
                </Typography>
            </Paper>

            <Box sx={{ mt: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: 'background.paper' }}>
                <IssueCertificateForm />
            </Box>
        </Box>
    );
};

export default IssueCertificates;
