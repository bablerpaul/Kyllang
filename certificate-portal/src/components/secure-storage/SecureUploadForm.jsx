import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, TextField, Typography, CircularProgress, Alert, MenuItem } from '@mui/material';

// Mirrors the server's upload gate exactly (backend/src/modules/secure-storage/routes/storageRoutes.js: multer
// `allowedMimeTypes` and `limits.fileSize`). The server remains authoritative (it also checks file magic bytes).
export const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/dicom'];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
// The link types the upload API already supports (SecureFile.linkedEMR / linkedCertificate / linkedInsurance). The server
// checks that the linked record belongs to the selected patient.
const LINK_TYPES = [
    { value: 'linkedEMR', label: 'EMR', fieldLabel: 'Linked EMR ID' },
    { value: 'linkedCertificate', label: 'Medical Certificate', fieldLabel: 'Linked Certificate ID' },
    { value: 'linkedInsurance', label: 'Insurance Claim', fieldLabel: 'Linked Insurance Claim ID' },
];
const ACCEPT_ATTR =[...ALLOWED_UPLOAD_MIME_TYPES, '.pdf', '.png', '.jpg', '.jpeg', '.dcm'].join(',');

// Returns a user-facing error for a file the server would reject, or null when it may be uploaded.
export const validateUploadFile = (file) => {
    if (!file) return 'Please choose a file.';
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
        return 'Unsupported file type. Only PDF, PNG, JPG, JPEG, and DICOM files are allowed.';
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return 'File is too large. The maximum upload size is 20 MB.';
    }
    return null;
};

const SecureUploadForm = ({ onUploadSuccess }) => {
    const [file, setFile] = useState(null);
    const [patientId, setPatientId] = useState('');
    const [linkType, setLinkType] = useState('linkedEMR');
    const [linkedId, setLinkedId] = useState('');
    const link = LINK_TYPES.find(l => l.value === linkType) || LINK_TYPES[0];
    const [documentType, setDocumentType] = useState('EMR');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        const chosen = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
        e.target.value = ''; // allow re-selecting the same file after a rejection
        setResult(null);
        const problem = chosen ? validateUploadFile(chosen) : null;
        if (problem) {
            setFile(null);
            setError(problem);
            return;
        }
        setError(null);
        setFile(chosen);
    };

    const handleUpload = async () => {
        if (!file || !patientId || !linkedId.trim()) {
            setError(`Please provide a file, a Patient ID, and a ${link.fieldLabel}`);
            return;
        }
        const problem = validateUploadFile(file);
        if (problem) {
            setError(problem);
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('patientId', patientId);
        formData.append(link.value, linkedId.trim());
        formData.append('documentType', documentType);

        try {
            // Session cookie auth (same as the rest of the app); FormData sets its own multipart Content-Type.
            const response = await fetch('/api/secure-storage/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });
            const resData = await response.json().catch(() => null);

            if (!response.ok) {
                // Client errors carry a safe, user-facing message; never surface server internals.
                const message = response.status < 500 && resData && resData.message
                    ? resData.message
                    : 'Upload failed. Please try again.';
                throw new Error(message);
            }

            setResult({ ...(resData && resData.data), message: resData && resData.message });
            setFile(null);
            if (typeof onUploadSuccess === 'function') onUploadSuccess();
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
                    {result.message || 'Document securely uploaded.'} <br/>
                    File ID: {result.metadata?.fileId} <br/>
                    FileName: {result.metadata?.fileName} <br/>
                    Storage reference: {result.metadata?.ipfsCid} <br/>
                    Blockchain status: {result.metadata?.blockchainStatus || 'unknown'}
                    {result.metadata?.transactionHash ? <><br/>Tx Hash: {result.metadata.transactionHash}</> : null}
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
                    select
                    label="Link Type"
                    value={linkType}
                    onChange={(e) => { setLinkType(e.target.value); setLinkedId(''); }}
                    fullWidth
                >
                    {LINK_TYPES.map(l => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
                </TextField>

                <TextField
                    label={link.fieldLabel}
                    variant="outlined"
                    value={linkedId}
                    onChange={(e) => setLinkedId(e.target.value)}
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
                        accept={ACCEPT_ATTR}
                        onChange={handleFileChange}
                    />
                </Button>
                <Typography variant="caption" color="text.secondary">
                    PDF, PNG, JPG, JPEG or DICOM · max 20 MB
                </Typography>
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

SecureUploadForm.propTypes = {
    onUploadSuccess: PropTypes.func,
};

export default SecureUploadForm;
