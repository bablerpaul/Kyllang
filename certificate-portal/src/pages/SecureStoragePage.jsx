import React from 'react';
import { Container, Typography, Grid } from '@mui/material';
import SecureUploadForm from '../components/secure-storage/SecureUploadForm';
import SecureVerifyForm from '../components/secure-storage/SecureVerifyForm';

const SecureStoragePage = () => {
    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Secure Storage System
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" paragraph>
                Encrypt, anchor on-chain, and store medical files securely on IPFS.
            </Typography>

            <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                    <SecureUploadForm />
                </Grid>
                <Grid item xs={12} md={6}>
                    <SecureVerifyForm />
                </Grid>
            </Grid>
        </Container>
    );
};

export default SecureStoragePage;
