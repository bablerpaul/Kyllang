import React, { useState } from 'react';
import { Box, Button, TextField, Typography, CircularProgress, Alert } from '@mui/material';

const SecureVerifyForm = () => {
    const [documentId, setDocumentId] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleVerify = async () => {
        if (!documentId) {
            setError('Please provide a File ID to verify.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch(`/api/secure-storage/verify/${documentId}`, {
                method: 'GET',
                headers: {
                    // 'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const resData = await response.json();
            const data = resData.data;

            if (!response.ok) {
                throw new Error(data.message || 'Verification failed');
            }

            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3, border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: 'background.paper', mb: 3 }}>
            <Typography variant="h6" gutterBottom>
                Verify File Integrity
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            {result && (
                <Alert severity={result.verified ? "success" : "error"} sx={{ mb: 2 }}>
                    <strong>{result.message}</strong><br/><br/>
                    Generated Hash: <br/><Typography variant="caption" sx={{ wordBreak: 'break-all' }}>{result.generatedHash}</Typography><br/>
                    Expected Hash: <br/><Typography variant="caption" sx={{ wordBreak: 'break-all' }}>{result.expectedHash}</Typography><br/><br/>
                    {result.verified && result.onChainDetails && (
                        <>
                            <strong>On-Chain Details:</strong><br/>
                            Patient ID: {result.onChainDetails.patientId}<br/>
                            IPFS CID: {result.onChainDetails.ipfsCid}
                        </>
                    )}
                </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField 
                    label="File ID" 
                    variant="outlined" 
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    fullWidth
                />

                <Button 
                    variant="contained" 
                    color="secondary" 
                    onClick={handleVerify}
                    disabled={loading}
                >
                    {loading ? <CircularProgress size={24} /> : 'Verify Integrity'}
                </Button>
            </Box>
        </Box>
    );
};

export default SecureVerifyForm;
