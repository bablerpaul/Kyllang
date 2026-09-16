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
    Alert,
    Chip,
    TextField
} from '@mui/material';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import { apiFetch } from '../../../utils/api';
import PrivateKeyDialog from '../../shared/PrivateKeyDialog';
import { decryptKeyWithX25519 } from '../../../utils/cryptoUtils';
import { commitmentToBytes32, computeCommitment } from '../../../utils/poseidonUtils';
import { storeCredential } from '../../../utils/credentialVault';
import { retrievePatientPrivateKey } from '../../../utils/patientKeyVault';

const MyCertificates = () => {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedCert, setSelectedCert] = useState(null);
    const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
    const [passphraseInput, setPassphraseInput] = useState('');
    const [credentialImporting, setCredentialImporting] = useState(false);

    useEffect(() => {
        const fetchCertificates = async () => {
            try {
                const data = await apiFetch('/api/patient/certificates');
                const certs = Array.isArray(data) ? data : (data?.data || []);
                setCertificates(certs);
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

    const handleImportCredentialClick = () => {
        if (!selectedCert?.encryptedCredential) return;
        setPassphraseInput('');
        setPassphraseDialogOpen(true);
    };

    const handleImportCredentialSubmit = async () => {
        if (!selectedCert?.encryptedCredential) return;
        const passphrase = passphraseInput;
        if (!passphrase) return;
        
        setPassphraseDialogOpen(false);
        setCredentialImporting(true);
        try {
            const privateKey = await retrievePatientPrivateKey(passphrase);
            const credential = JSON.parse(decryptKeyWithX25519(selectedCert.encryptedCredential, privateKey));
            const recomputed = await computeCommitment(
                credential.patientId,
                credential.diagnosisCode,
                credential.validFrom,
                credential.secretSalt,
            );
            if (commitmentToBytes32(recomputed).toLowerCase() !== String(selectedCert.publicCommitmentHash).toLowerCase()) {
                throw new Error('Credential commitment does not match this certificate.');
            }
            await storeCredential(credential, passphrase);
            alert('ZKP credential imported into the encrypted local vault.');
        } catch (error) {
            alert(`Credential import failed: ${error.message}`);
        } finally {
            setCredentialImporting(false);
        }
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
        if (!selectedCert) return;

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const patientId = typeof selectedCert.patient === 'object'
                ? selectedCert.patient._id
                : selectedCert.patient;
            const issuer = selectedCert.issuedBy?.name || 'Unknown Issuer';
            const qrCanvas = document.querySelector('#certificate-print-area canvas');

            pdf.setFontSize(20);
            pdf.text('MEDICAL CERTIFICATE', 105, 25, { align: 'center' });
            pdf.setFontSize(11);
            pdf.text(`Patient ID: ${patientId || 'Patient'}`, 20, 45);
            pdf.text(`Issued By: Dr. ${issuer}`, 20, 55);
            pdf.text(`Valid: ${new Date(selectedCert.validFrom).toLocaleDateString()} - ${new Date(selectedCert.validUntil).toLocaleDateString()}`, 20, 65);
            pdf.text(`Remarks: ${selectedCert.remarks || 'None'}`, 20, 75);
            pdf.text(`Certificate ID: ${selectedCert._id}`, 20, 85);
            pdf.text(`Commitment: ${selectedCert.publicCommitmentHash || selectedCert.verificationHash || 'Unavailable'}`, 20, 95, { maxWidth: 170 });

            if (selectedCert.status === 'revoked') {
                pdf.setTextColor(190, 30, 30);
                pdf.setFontSize(15);
                pdf.text('REVOKED - NOT VALID', 105, 115, { align: 'center' });
                pdf.setTextColor(0, 0, 0);
            }

            if (qrCanvas) {
                pdf.addImage(qrCanvas.toDataURL('image/png'), 'PNG', 75, 130, 60, 60);
            }
            pdf.save(`certificate-${selectedCert._id}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF');
        }
    };

    return (
        <Box sx={{ p: { xs: 0, md: 0 } }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
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
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                                        Certificate
                                        {cert.status === 'revoked' && (
                                            <Chip label="REVOKED" color="error" size="small" />
                                        )}
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
                        <Box id="certificate-print-area" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, bgcolor: 'background.paper' }}>
                            <Box sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', mb: 3, borderRadius: 2 }}>
                                <QRCodeCanvas
                                    value={getQRCodeData(selectedCert)}
                                    size={256}
                                    level="H"
                                    includeMargin={true}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
                                Scan this QR code to verify the authenticity securely without querying standard records (ZKP HMAC concept).
                            </Typography>
                            {selectedCert.status === 'revoked' && (
                                <Box sx={{ mt: 2, p: 2, width: '100%', bgcolor: '#ffebee', color: '#c62828', textAlign: 'center', border: '1px solid #c62828', borderRadius: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>REVOKED — NOT VALID</Typography>
                                    <Typography variant="body2">This certificate was revoked by the issuer.</Typography>
                                    {selectedCert.revokedAt && <Typography variant="caption">Revoked on: {new Date(selectedCert.revokedAt).toLocaleDateString()}</Typography>}
                                </Box>
                            )}

                            <Box sx={{ width: '100%', mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
                    {selectedCert?.encryptedCredential && (
                        <Button onClick={handleImportCredentialClick} disabled={credentialImporting} variant="outlined">
                            Import ZK Credential
                        </Button>
                    )}
                    <Button onClick={handleDownloadPDF} variant="outlined" color="primary">Download as PDF</Button>
                    <Button onClick={() => setSelectedCert(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Passphrase Dialog */}
            <Dialog open={passphraseDialogOpen} onClose={() => setPassphraseDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Unlock Local Vault</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" gutterBottom>
                        Enter your vault passphrase to securely decrypt your local private key.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Vault Passphrase"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passphraseInput}
                        onChange={(e) => setPassphraseInput(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPassphraseDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleImportCredentialSubmit} variant="contained" color="primary">Unlock & Import</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MyCertificates;
