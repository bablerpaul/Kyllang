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
import { getCredential, listCredentials, storeCredential } from '../../../utils/credentialVault';
import { retrievePatientPrivateKey } from '../../../utils/patientKeyVault';
import {
    CredentialValidationError, findVaultIdForCertificate, verifyCertificateCredential,
} from '../../../utils/patientCredential';

const VAULT_MESSAGES = {
    unlockFailed: 'Your vault could not be unlocked, or the credential could not be decrypted.',
    identityUnavailable: 'Your patient identity could not be confirmed. Please try again.',
    notImported: 'This certificate has not been imported into this browser yet.',
    imported: 'Credential verified and imported into your encrypted local vault.',
};

// Only the fields the details/QR/PDF show — never the salt or the commitment inputs beyond these.
const toDisplayCredential = (cert, credential) => ({
    certId: String(cert._id),
    diagnosisCode: String(credential.diagnosisCode),
    validFrom: credential.validFrom,
    validUntil: credential.validUntil,
});

const fmtUnixDate = (seconds) => new Date(seconds * 1000).toLocaleDateString();

// Status precedence: revoked > expired > active. Expiry is derived from validUntil, never persisted.
const getCertStatus = (cert) => {
    if (cert?.status === 'revoked') return 'revoked';
    if (cert?.validUntil && new Date(cert.validUntil) < new Date()) return 'expired';
    return 'active';
};

const MyCertificates = () => {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedCert, setSelectedCert] = useState(null);
    const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
    const [passphraseInput, setPassphraseInput] = useState('');
    const [credentialImporting, setCredentialImporting] = useState(false);
    const [passphraseMode, setPassphraseMode] = useState('import'); // 'import' | 'readback'
    const [vaultIds, setVaultIds] = useState([]); // non-sensitive commitment ids from the local credential vault
    const [verifiedCredential, setVerifiedCredential] = useState(null); // transient, display fields only
    const [notice, setNotice] = useState(null); // { severity, text }

    const refreshVaultIds = async () => {
        try {
            setVaultIds((await listCredentials()).map((r) => String(r.id)));
        } catch (_) {
            setVaultIds([]);
        }
    };

    useEffect(() => {
        refreshVaultIds();
    }, []);

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
        setVerifiedCredential(null);
        setNotice(null);
        setSelectedCert(cert);
    };

    const closeDetails = () => {
        setVerifiedCredential(null); // clear transient decrypted details
        setSelectedCert(null);
    };

    const selectedVaultId = selectedCert ? findVaultIdForCertificate(vaultIds, selectedCert.publicCommitmentHash) : null;
    const selectedVerified = verifiedCredential && selectedCert && verifiedCredential.certId === String(selectedCert._id)
        ? verifiedCredential : null;

    const openPassphraseDialog = (mode) => {
        if (!selectedCert?.encryptedCredential) return;
        setNotice(null);
        setPassphraseMode(mode);
        setPassphraseInput('');
        setPassphraseDialogOpen(true);
    };

    // The logged-in patient's identities (Patient-profile _id and User _id), from the session-scoped profile endpoint.
    const loadPatientIds = async () => {
        const res = await apiFetch('/api/patient/profile');
        const profile = res?.data || res;
        return [profile?._id, profile?.user?._id ?? profile?.user].filter(Boolean).map(String);
    };

    const handlePassphraseSubmit = async () => {
        const cert = selectedCert;
        const mode = passphraseMode;
        let passphrase = passphraseInput;
        setPassphraseInput('');
        if (!cert?.encryptedCredential || !passphrase) return;

        setPassphraseDialogOpen(false);
        setCredentialImporting(true);
        let privateKey = null;
        let credential = null;
        try {
            let patientIds;
            try {
                patientIds = await loadPatientIds();
            } catch (_) {
                throw new Error(VAULT_MESSAGES.identityUnavailable);
            }

            if (mode === 'import') {
                // Decrypt the certificate's own encryptedCredential with the patient's vault key.
                try {
                    privateKey = await retrievePatientPrivateKey(passphrase);
                    credential = JSON.parse(decryptKeyWithX25519(cert.encryptedCredential, privateKey));
                } catch (_) {
                    throw new Error(VAULT_MESSAGES.unlockFailed);
                } finally {
                    privateKey = null;
                }
                // Every check must pass before anything is stored.
                await verifyCertificateCredential(credential, { certificate: cert, patientIds });
                await storeCredential(credential, passphrase);
                await refreshVaultIds();
                setVerifiedCredential(toDisplayCredential(cert, credential));
                setNotice({ severity: 'success', text: VAULT_MESSAGES.imported });
            } else {
                // Read back the imported credential from the encrypted local vault, then re-validate it.
                const vaultId = findVaultIdForCertificate(vaultIds, cert.publicCommitmentHash);
                if (!vaultId) throw new Error(VAULT_MESSAGES.notImported);
                try {
                    // Confirms the passphrase unlocks THIS account's patient key before the vault record is trusted.
                    privateKey = await retrievePatientPrivateKey(passphrase);
                    privateKey = null;
                    credential = await getCredential(vaultId, passphrase);
                } catch (_) {
                    throw new Error(VAULT_MESSAGES.unlockFailed);
                } finally {
                    privateKey = null;
                }
                if (!credential) throw new Error(VAULT_MESSAGES.notImported);
                await verifyCertificateCredential(credential, { certificate: cert, patientIds });
                setVerifiedCredential(toDisplayCredential(cert, credential));
            }
        } catch (error) {
            setVerifiedCredential(null);
            const text = error instanceof CredentialValidationError || Object.values(VAULT_MESSAGES).includes(error?.message)
                ? error.message : VAULT_MESSAGES.unlockFailed;
            setNotice({ severity: 'error', text: mode === 'import' ? `Credential import failed: ${text}` : text });
        } finally {
            passphrase = null;
            privateKey = null;
            credential = null;
            setCredentialImporting(false);
        }
    };

    const getQRCodeData = (cert, verified) => {
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
                // Only a credential verified in this session supplies the diagnosis (the Certificate record has none).
                ...(verified ? { diagnosis: verified.diagnosisCode } : {}),
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
            pdf.text(`Diagnosis: ${selectedVerified ? selectedVerified.diagnosisCode : 'Encrypted (not unlocked)'}`, 20, 65, { maxWidth: 170 });
            pdf.text(`Valid: ${new Date(selectedCert.validFrom).toLocaleDateString()} - ${new Date(selectedCert.validUntil).toLocaleDateString()}`, 20, 75);
            pdf.text(`Remarks: ${selectedCert.remarks || 'None'}`, 20, 85);
            pdf.text(`Certificate ID: ${selectedCert._id}`, 20, 95);
            pdf.text(`Commitment: ${selectedCert.publicCommitmentHash || selectedCert.verificationHash || 'Unavailable'}`, 20, 105, { maxWidth: 170 });

            const pdfStatus = getCertStatus(selectedCert);
            if (pdfStatus === 'revoked') {
                pdf.setTextColor(190, 30, 30);
                pdf.setFontSize(15);
                pdf.text('REVOKED - NOT VALID', 105, 125, { align: 'center' });
                pdf.setTextColor(0, 0, 0);
            } else if (pdfStatus === 'expired') {
                pdf.setTextColor(230, 81, 0);
                pdf.setFontSize(15);
                pdf.text('EXPIRED - NOT VALID', 105, 125, { align: 'center' });
                pdf.setTextColor(0, 0, 0);
            }

            if (qrCanvas) {
                pdf.addImage(qrCanvas.toDataURL('image/png'), 'PNG', 75, 140, 60, 60);
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
                                        {getCertStatus(cert) === 'revoked' && (
                                            <Chip label="REVOKED" color="error" size="small" />
                                        )}
                                        {getCertStatus(cert) === 'expired' && (
                                            <Chip label="EXPIRED" color="warning" size="small" />
                                        )}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        <strong>Diagnosis:</strong>{' '}
                                        {findVaultIdForCertificate(vaultIds, cert.publicCommitmentHash)
                                            ? 'Encrypted — imported (unlock in details)'
                                            : 'Encrypted — not imported yet'}
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
            <Dialog open={!!selectedCert} onClose={() => !credentialImporting && closeDetails()} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Certificate Details & Verifiable QR
                </DialogTitle>
                <DialogContent dividers>
                    {notice && (
                        <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
                            {notice.text}
                        </Alert>
                    )}
                    {selectedCert && (
                        <Box id="certificate-print-area" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, bgcolor: 'background.paper' }}>
                            <Box sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', mb: 3, borderRadius: 2 }}>
                                <QRCodeCanvas
                                    value={getQRCodeData(selectedCert, selectedVerified)}
                                    size={256}
                                    level="H"
                                    includeMargin={true}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
                                Scan this QR code to verify the authenticity securely without querying standard records (ZKP HMAC concept).
                            </Typography>
                            {getCertStatus(selectedCert) === 'revoked' && (
                                <Box sx={{ mt: 2, p: 2, width: '100%', bgcolor: '#ffebee', color: '#c62828', textAlign: 'center', border: '1px solid #c62828', borderRadius: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>REVOKED — NOT VALID</Typography>
                                    <Typography variant="body2">This certificate was revoked by the issuer.</Typography>
                                    {selectedCert.revokedAt && <Typography variant="caption">Revoked on: {new Date(selectedCert.revokedAt).toLocaleDateString()}</Typography>}
                                </Box>
                            )}
                            {getCertStatus(selectedCert) === 'expired' && (
                                <Box sx={{ mt: 2, p: 2, width: '100%', bgcolor: '#fff3e0', color: '#e65100', textAlign: 'center', border: '1px solid #e65100', borderRadius: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>EXPIRED — NOT VALID</Typography>
                                    <Typography variant="body2">This certificate's validity period has ended.</Typography>
                                    <Typography variant="caption">Valid Until: {new Date(selectedCert.validUntil).toLocaleDateString()}</Typography>
                                </Box>
                            )}

                            {selectedVerified && (
                                <Box data-testid="verified-credential" sx={{ width: '100%', mt: 2, p: 2, border: '1px solid', borderColor: 'success.main', borderRadius: 1 }}>
                                    <Typography variant="subtitle2" color="success.main" gutterBottom>
                                        Verified credential (matches the registered commitment)
                                    </Typography>
                                    <Typography variant="body2"><strong>Diagnosis:</strong> {selectedVerified.diagnosisCode}</Typography>
                                    <Typography variant="body2">
                                        <strong>Credential validity:</strong> {fmtUnixDate(selectedVerified.validFrom)} to {fmtUnixDate(selectedVerified.validUntil)}
                                    </Typography>
                                </Box>
                            )}

                            <Box sx={{ width: '100%', mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>Raw Certificate Data</Typography>
                                <Typography variant="body2"><strong>Certificate ID:</strong> {String(selectedCert._id)}</Typography>
                                <Typography variant="body2">
                                    <strong>Diagnosis:</strong>{' '}
                                    {selectedVerified ? selectedVerified.diagnosisCode
                                        : selectedVaultId ? 'Encrypted — use "Show Verified Details" to unlock'
                                            : 'Encrypted — import the credential to view'}
                                </Typography>
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
                    {selectedCert?.encryptedCredential && !selectedVerified && (
                        selectedVaultId ? (
                            <Button onClick={() => openPassphraseDialog('readback')} disabled={credentialImporting} variant="outlined">
                                Show Verified Details
                            </Button>
                        ) : (
                            <Button onClick={() => openPassphraseDialog('import')} disabled={credentialImporting} variant="outlined">
                                Import ZK Credential
                            </Button>
                        )
                    )}
                    <Button onClick={handleDownloadPDF} variant="outlined" color="primary" disabled={credentialImporting}>Download as PDF</Button>
                    <Button onClick={closeDetails} disabled={credentialImporting}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Passphrase Dialog */}
            <Dialog open={passphraseDialogOpen} onClose={() => { setPassphraseInput(''); setPassphraseDialogOpen(false); }} maxWidth="xs" fullWidth>
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
                        slotProps={{ htmlInput: { autoComplete: 'off' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setPassphraseInput(''); setPassphraseDialogOpen(false); }}>Cancel</Button>
                    <Button onClick={handlePassphraseSubmit} variant="contained" color="primary">
                        {passphraseMode === 'import' ? 'Unlock & Import' : 'Unlock & Show'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MyCertificates;
