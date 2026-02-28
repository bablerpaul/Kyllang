import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Grid,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { apiFetch } from '../../../utils/api';

const MyCertificates = () => {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedCert, setSelectedCert] = useState(null);

    useEffect(() => {
        const fetchCertificates = async () => {
            try {
                const data = await apiFetch('/api/patient/certificates');
                setCertificates(data || []);
            } catch (err) {
                setError(err.message || 'Failed to fetch certificates');
            } finally {
                setLoading(false);
            }
        };

        fetchCertificates();
    }, []);

    const handleViewQR = (cert) => {
        setSelectedCert(cert);
    };

    const getQRCodeData = (cert) => {
        // Normalize patient object if populated, to just the string ID
        const pId = typeof cert.patient === 'object' ? cert.patient._id : cert.patient;

        // Normalize dates back to "YYYY-MM-DD" as originally submitted to the backend to ensure Hash matches
        const formatDt = (dt) => {
            if (!dt) return dt;
            const d = new Date(dt);
            // Reconstruct YYYY-MM-DD manually to avoid timezone shift from JS
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };

        // The QR code contains the verification data and the proof (verificationHash)
        return JSON.stringify({
            data: {
                patientId: pId,
                diagnosis: cert.diagnosis,
                validFrom: cert.validFrom ? cert.validFrom.split('T')[0] : cert.validFrom,
                validUntil: cert.validUntil ? cert.validUntil.split('T')[0] : cert.validUntil
            },
            hash: cert.verificationHash
        });
    };

    const handleDownloadPDF = async () => {
        const element = document.getElementById('certificate-print-area');
        if (!element) return;

        try {
            const canvas = await html2canvas(element, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            // Format to fit the canvas dimensions relative to an A4 if desired, or exact size
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`certificate-${selectedCert._id}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF');
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                My Certificates
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
                This section displays all your generated medical certificates. You can present the QR code to anyone to verify its authenticity securely using the ZKP HMAC concept.
            </Alert>

            {loading ? (
                <Typography>Loading...</Typography>
            ) : error ? (
                <Alert severity="error">{error}</Alert>
            ) : certificates.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>You have no certificates generated yet.</Alert>
            ) : (
                <Grid container spacing={3}>
                    {certificates.map((cert) => (
                        <Grid item xs={12} sm={6} md={4} key={cert._id}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Certificate
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        <strong>Diagnosis:</strong> {cert.diagnosis}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        <strong>Issued By:</strong> Dr. {cert.issuedBy?.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        <strong>Valid To:</strong> {new Date(cert.validUntil).toLocaleDateString()}
                                    </Typography>
                                    <Box sx={{ mt: 2 }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={() => handleViewQR(cert)}
                                            fullWidth
                                        >
                                            View QR & Details
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Viewer Dialog */}
            <Dialog open={!!selectedCert} onClose={() => setSelectedCert(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Certificate Details & Verifiable QR
                </DialogTitle>
                <DialogContent dividers>
                    {selectedCert && (
                        <Box id="certificate-print-area" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, bgcolor: '#fff' }}>
                            <Box sx={{ p: 2, bgcolor: '#fff', border: '1px solid #eee', mb: 3, borderRadius: 2 }}>
                                <QRCodeSVG
                                    value={getQRCodeData(selectedCert)}
                                    size={256}
                                    level="H"
                                    includeMargin={true}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
                                Scan this QR code to verify the authenticity securely without querying standard records (ZKP HMAC concept).
                            </Typography>

                            <Box sx={{ width: '100%', mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>Raw Certificate Data</Typography>
                                <Typography variant="body2"><strong>Diagnosis:</strong> {selectedCert.diagnosis}</Typography>
                                <Typography variant="body2"><strong>Remarks:</strong> {selectedCert.remarks || 'None'}</Typography>
                                <Typography variant="body2"><strong>Date:</strong> {new Date(selectedCert.validFrom).toLocaleDateString()} to {new Date(selectedCert.validUntil).toLocaleDateString()}</Typography>
                                <Typography variant="caption" sx={{ mt: 1, display: 'block', wordBreak: 'break-all', color: 'primary.main' }}>
                                    <strong>Secure Hash:</strong> {selectedCert.verificationHash}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDownloadPDF} variant="outlined" color="primary">Download as PDF</Button>
                    <Button onClick={() => setSelectedCert(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MyCertificates;
