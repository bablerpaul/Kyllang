import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Grid,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert
} from '@mui/material';
import { Description, Visibility, Download } from '@mui/icons-material';
import forge from 'node-forge';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../../../utils/api';
import DocumentRenderer from '../shared/DocumentRenderer';

const MyDocuments = () => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [decryptedContent, setDecryptedContent] = useState('');
    const printRef = useRef(null);

    const fetchDocuments = async () => {
        try {
            const data = await apiFetch('/api/patient/documents');
            setDocuments(data || []);
            setLoading(false);
        } catch (err) {
            setError(err.message || 'Failed to fetch documents');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleView = (doc) => {
        const privateKeyStr = window.prompt("To decrypt and view this document, please paste your RSA Private Key:");
        if (!privateKeyStr) return;

        try {
            const privateKey = forge.pki.privateKeyFromPem(privateKeyStr);

            // Decrypt AES key
            const decodedPatientEncryptedKey = forge.util.decode64(doc.patientEncryptedKey);
            const aesKey = privateKey.decrypt(decodedPatientEncryptedKey, 'RSA-OAEP', {
                md: forge.md.sha256.create(),
                mgf1: { md: forge.md.sha256.create() }
            });

            // Decrypt Document Data
            const combinedData = forge.util.decode64(doc.encryptedData);
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
                setSelectedDoc(doc);
                setViewerOpen(true);
            } else {
                alert('Decryption failed. Document may be compromised or key is incorrect.');
            }
        } catch (err) {
            alert('Error decrypting document. Ensure your private key is valid. Detail: ' + err.message);
        }
    };

    const handleDownload = (doc) => {
        handleView(doc);
    };

    const executeDownloadFile = async () => {
        if (!decryptedContent || !selectedDoc) return;

        const element = printRef.current;
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const dataUrl = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${selectedDoc.title.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF', error);
            alert('Failed to generate PDF document.');
        }
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                My Encrypted Documents
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
                These are documents uploaded securely by your hospital administrators. You will need your private key to access their contents.
            </Alert>

            {loading ? (
                <Typography>Loading...</Typography>
            ) : error ? (
                <Alert severity="error">{error}</Alert>
            ) : documents.length === 0 ? (
                <Alert severity="info">You have no documents uploaded to your account.</Alert>
            ) : (
                <Grid container spacing={3}>
                    {documents.map((doc) => (
                        <Grid item xs={12} sm={6} md={4} key={doc._id}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        <Description sx={{ mr: 1, color: 'primary.main' }} />
                                        <Typography variant="h6" component="div">
                                            {doc.title}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Type: <Chip label={doc.type.replace('_', ' ')} size="small" sx={{ textTransform: 'capitalize' }} />
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Uploaded: {new Date(doc.createdAt).toLocaleDateString()}
                                    </Typography>
                                    <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={<Visibility />}
                                            onClick={() => handleView(doc)}
                                            fullWidth
                                        >
                                            View
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<Download />}
                                            onClick={() => handleDownload(doc)}
                                            fullWidth
                                        >
                                            Download
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Viewer Dialog */}
            <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {selectedDoc?.title}
                </DialogTitle>
                <DialogContent dividers sx={{ backgroundColor: '#e0e0e0', display: 'flex', justifyContent: 'center' }}>
                    <Box
                        ref={printRef}
                        sx={{
                            width: '210mm',
                            minHeight: '297mm',
                            backgroundColor: 'white',
                            boxShadow: 3
                        }}
                    >
                        <DocumentRenderer documentData={selectedDoc} parsedContent={decryptedContent} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={executeDownloadFile} startIcon={<Download />} color="primary" variant="contained">
                        Download PDF
                    </Button>
                    <Button onClick={() => setViewerOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MyDocuments;
