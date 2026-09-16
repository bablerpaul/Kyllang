import React from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { MedicalServices as MedicalServicesIcon, People as PeopleIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const IssueCertificates = () => {
    const navigate = useNavigate();

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 4, mb: 3, textAlign: 'center' }}>
                <MedicalServicesIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
                <Typography variant="h4" gutterBottom>
                    Issue Medical Certificates
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 4 }}>
                    To issue a medical certificate, please select a patient from your authorized patients list. The certificate workflow now integrates Zero-Knowledge Proofs for enhanced privacy and is securely anchored to the blockchain.
                </Typography>
                <Button 
                    variant="contained" 
                    color="primary" 
                    size="large"
                    startIcon={<PeopleIcon />}
                    onClick={() => navigate('/doctor/patients')}
                >
                    Go to My Patients
                </Button>
            </Paper>
        </Box>
    );
};

export default IssueCertificates;
