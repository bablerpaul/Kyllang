import React, { useState } from 'react';
import { Box, Button, TextField, Typography, CircularProgress, Alert, MenuItem } from '@mui/material';

const SecureUploadForm = () => {
    const [file, setFile] = useState(null);
    const [patientId, setPatientId] = useState('');
    const [linkedEMR, setLinkedEMR] = useState('');
    const [documentType, setDocumentType] = useState('EMR');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file || !patientId || !linkedEMR) {
            setError('Please provide a file, a Patient ID, and a Linked EMR ID');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('patientId', patientId);
        formData.append('linkedEMR', linkedEMR);
        formData.append('documentType', documentType);

        try {
            // Note: Replace with your actual Axios instance or fetch setup
            const response = await fetch('/api/secure-storage/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    // 'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const resData = await response.json();
            const data = resData.data;

            if (!response.ok) {
                throw new Error(data.message || 'Upload failed');
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
                Upload Secure Document
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {result && (
                <Alert severity="success" sx={{ mb: 2 }}>
                    Successfully uploaded! <br/>
                    File ID: {result.metadata?.fileId} <br/>
                    FileName: {result.metadata?.fileName} <br/>
                    IPFS CID: {result.metadata?.ipfsCid} <br/>
                    Tx Hash: {result.metadata?.transactionHash}
                </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField 
                    label="Patient ID" 
                    variant="outlined" 
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    fullWidth
                />
                
                <TextField 
                    label="Linked EMR ID" 
                    variant="outlined" 
                    value={linkedEMR}
                    onChange={(e) => setLinkedEMR(e.target.value)}
                    fullWidth
                />
                
                <TextField
                    select
                    label="Document Type"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    fullWidth
                >
                    <MenuItem value="EMR">EMR</MenuItem>
                    <MenuItem value="LabReport">Lab Report</MenuItem>
                    <MenuItem value="MedicalCertificate">Medical Certificate</MenuItem>
                </TextField>

                <Button
                    variant="contained"
                    component="label"
                >
                    Select File
                    <input
                        type="file"
                        hidden
                        onChange={handleFileChange}
                    />
                </Button>
                {file && <Typography variant="body2">{file.name}</Typography>}

                <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleUpload}
                    disabled={loading}
                >
                    {loading ? <CircularProgress size={24} /> : 'Secure & Upload'}
                </Button>
            </Box>
        </Box>
    );
};

export default SecureUploadForm;
