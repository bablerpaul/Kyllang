import { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    List,
    ListItem,
    ListItemText,
    Chip,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Grid
} from '@mui/material';
import { Notifications as NotificationsIcon, Visibility } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import forge from 'node-forge';

const CertificateRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [formData, setFormData] = useState({
        diagnosis: '',
        remarks: '',
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [decryptedContent, setDecryptedContent] = useState('');

    const fetchRequests = async () => {
        try {
            const data = await apiFetch('/api/doctor/certificate-requests');
            setRequests(data);
        } catch (err) {
            console.error("Failed to fetch certificate requests:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleApproveClick = (request) => {
        setSelectedRequest(request);
        // Pre-fill diagnosis from request reason or type if possible
        setFormData({
            diagnosis: '',
            remarks: `Based on request for: ${request.certificateType}`,
            validFrom: new Date().toISOString().split('T')[0],
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
    };

    const handleApproveSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await apiFetch(`/api/doctor/certificate-requests/${selectedRequest._id}/approve`, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            alert('Certificate successfully issued!');
            setSelectedRequest(null);
            fetchRequests();
        } catch (err) {
            alert(`Failed to approve: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleViewDocument = async (request) => {
        try {
            const docs = await apiFetch(`/api/doctor/patients/${request.patient._id}/documents`);
            const vaccineDoc = docs.find(d => d.type === 'vaccine_certificate');

            if (!vaccineDoc) {
                alert("Patient does not have a vaccine document uploaded.");
                return;
            }

            if (!vaccineDoc.hasAccess) {
                alert("You do not have active access to the patient's vaccine document.");
                return;
            }

            const privateKeyStr = window.prompt("To decrypt and view this document, please paste your RSA Private Key:");
            if (!privateKeyStr) return;

            const privateKey = forge.pki.privateKeyFromPem(privateKeyStr);

            const decodedDoctorEncryptedKey = forge.util.decode64(vaccineDoc.doctorEncryptedKey);
            const aesKey = privateKey.decrypt(decodedDoctorEncryptedKey, 'RSA-OAEP', {
                md: forge.md.sha256.create(),
                mgf1: { md: forge.md.sha256.create() }
            });

            const combinedData = forge.util.decode64(vaccineDoc.encryptedData);
            const iv = combinedData.substring(0, 12);
            const tag = combinedData.substring(12, 28);
            const encryptedContent = combinedData.substring(28);

            const decipher = forge.cipher.createDecipher('AES-GCM', aesKey);
            decipher.start({
                iv: iv,
                tag: forge.util.createBuffer(tag)
            });
            decipher.update(forge.util.createBuffer(encryptedContent));
            const pass = decipher.finish();

            if (pass) {
                const rawJson = decipher.output.toString('utf8');
                let parsedContent = rawJson;
                try {
                    const obj = JSON.parse(rawJson);
                    parsedContent = JSON.stringify(obj, null, 2);
                } catch (e) { }

                setDecryptedContent(parsedContent);
                setViewerOpen(true);
            } else {
                alert('Decryption failed. Document may be compromised or key is incorrect.');
            }
        } catch (err) {
            alert('Error fetching or decrypting document: ' + err.message);
        }
    };

    if (loading) return <Typography>Loading requests...</Typography>;

    return (
        <Card elevation={3} sx={{ mb: 3 }}>
            <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NotificationsIcon color="primary" /> Pending Certificate Requests
                </Typography>

                {requests.length === 0 ? (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        No pending certificate requests at this time.
                    </Alert>
                ) : (
                    <List dense>
                        {requests.map((request) => (
                            <ListItem key={request._id} sx={{ borderBottom: '1px solid #eee', mb: 1, pb: 1, alignItems: 'flex-start' }}>
                                <ListItemText
                                    primary={`Patient: ${request.patient?.name || 'Unknown'}`}
                                    secondary={
                                        <>
                                            <Typography variant="caption" display="block">
                                                Type: <strong>{request.certificateType}</strong>
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Reason: {request.reason}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Requested: {new Date(request.createdAt).toLocaleDateString()}
                                            </Typography>
                                        </>
                                    }
                                />
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                                    <Chip label="Pending" size="small" color="warning" />
                                    {request.certificateType === 'vaccine' && (
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            color="info"
                                            onClick={() => handleViewDocument(request)}
                                        >
                                            View Reference Doc
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained"
                                        size="small"
                                        color="primary"
                                        onClick={() => handleApproveClick(request)}
                                        sx={{ minWidth: "120px" }}
                                    >
                                        Review & Approve
                                    </Button>
                                </Box>
                            </ListItem>
                        ))}
                    </List>
                )}
            </CardContent>

            {/* Approval Dialog */}
            <Dialog open={!!selectedRequest} onClose={() => setSelectedRequest(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Approve Certificate Request</DialogTitle>
                <form onSubmit={handleApproveSubmit}>
                    <DialogContent dividers>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Patient: <strong>{selectedRequest?.patient?.name}</strong><br />
                            Requested Type: <strong>{selectedRequest?.certificateType}</strong>
                        </Alert>
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Diagnosis / Assessment"
                                    value={formData.diagnosis}
                                    onChange={(e) => setFormData(prev => ({ ...prev, diagnosis: e.target.value }))}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    label="Remarks"
                                    value={formData.remarks}
                                    onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    type="date"
                                    label="Valid From"
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.validFrom}
                                    onChange={(e) => setFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    type="date"
                                    label="Valid Until"
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.validUntil}
                                    onChange={(e) => setFormData(prev => ({ ...prev, validUntil: e.target.value }))}
                                    required
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setSelectedRequest(null)}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={isSubmitting || !formData.diagnosis}>
                            {isSubmitting ? 'Approving...' : 'Approve & Issue Certificate'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Reference Document</DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ typography: 'body2', whiteSpace: 'pre-wrap', fontFamily: 'monospace', p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                        {decryptedContent}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewerOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default CertificateRequests;
