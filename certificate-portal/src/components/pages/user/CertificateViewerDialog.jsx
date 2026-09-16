import { useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Divider,
    Paper,
    Grid
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

const CertificateViewerDialog = ({ open, onClose, certificate }) => {
    const printRef = useRef();

    const handleDownloadPdf = async () => {
        if (!certificate) return;

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const patientId = typeof certificate.patient === 'object'
                ? certificate.patient._id
                : certificate.patient;
            const issuer = certificate.issuedBy?.name || 'Unknown Issuer';
            const qrCanvas = printRef.current?.querySelector('canvas');

            pdf.setFontSize(20);
            pdf.text('MEDICAL CERTIFICATE', 105, 25, { align: 'center' });
            pdf.setFontSize(11);
            pdf.text(`Patient ID: ${patientId || 'Patient'}`, 20, 45);
            pdf.text(`Issued By: Dr. ${issuer}`, 20, 55);
            pdf.text(`Valid: ${new Date(certificate.validFrom || certificate.createdAt).toLocaleDateString()} - ${certificate.validUntil ? new Date(certificate.validUntil).toLocaleDateString() : 'N/A'}`, 20, 65);
            pdf.text(`Remarks: ${certificate.remarks || certificate.treatment || 'None'}`, 20, 75);
            pdf.text(`Certificate ID: ${certificate._id}`, 20, 85);
            pdf.text(`Commitment: ${certificate.publicCommitmentHash || certificate.verificationHash || 'Unavailable'}`, 20, 95, { maxWidth: 170 });

            if (certificate.status === 'revoked') {
                pdf.setTextColor(190, 30, 30);
                pdf.setFontSize(15);
                pdf.text('REVOKED - NOT VALID', 105, 115, { align: 'center' });
                pdf.setTextColor(0, 0, 0);
            }

            if (qrCanvas) {
                pdf.addImage(qrCanvas.toDataURL('image/png'), 'PNG', 75, 130, 60, 60);
            }
            pdf.save(`Certificate_${certificate._id}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF', error);
            alert('Failed to generate PDF');
        }
    };

    if (!certificate) return null;

    // Ensure patientId is just the string ID
    const pId = typeof certificate.patient === 'object' ? certificate.patient._id : certificate.patient;

    // Format dates to YYYY-MM-DD
    const formatDt = (dt) => {
        if (!dt) return dt;
        const d = new Date(dt);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };

    // The verification data stringified for the QR Code
    // Privacy Architecture: We do NOT expose plaintext diagnosis here.
    // The verifier will only see the public commitment hash.
    const qrData = JSON.stringify({
        commitment: certificate.publicCommitmentHash || certificate.verificationHash
    });

    return (
        <Dialog open={open} onClose={() => onClose()} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                View Certificate
                <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadPdf}
                >
                    Download PDF
                </Button>
            </DialogTitle>
            <DialogContent dividers sx={{ backgroundColor: '#e0e0e0', display: 'flex', justifyContent: 'center' }}>
                <Paper
                    elevation={3}
                    ref={printRef}
                    sx={{
                        width: '210mm',
                        minHeight: '297mm',
                        p: 8,
                        backgroundColor: 'white',
                        position: 'relative'
                    }}
                >
                    <Box sx={{ textAlign: 'center', mb: 6 }}>
                        <Typography variant="h3" color="primary" gutterBottom>MEDICAL CERTIFICATE</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="subtitle1" color="text.secondary">
                            Official Medical Document
                        </Typography>
                        {certificate.status === 'revoked' && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: '#ffebee', color: '#c62828', textAlign: 'center', border: '2px solid #c62828', borderRadius: 1 }}>
                                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>REVOKED — NOT VALID</Typography>
                                <Typography variant="body1">This certificate was permanently revoked by the issuer.</Typography>
                                {certificate.revokedAt && <Typography variant="body2">Revoked on: {new Date(certificate.revokedAt).toLocaleDateString()}</Typography>}
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ mb: 4 }}>
                        <Typography variant="h6" gutterBottom>This is to certify that patient ID:</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>{certificate.patient}</Typography>
                        <Typography variant="body1">
                            has been examined and the following details are certified true.
                        </Typography>
                    </Box>

                    <Box sx={{ mb: 6, p: 3, backgroundColor: '#f9f9f9', borderLeft: '4px solid #1976d2' }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="subtitle2" color="text.secondary">Diagnosis/Purpose</Typography>
                                <Typography variant="body1" gutterBottom>{certificate.diagnosis || certificate.type || 'Secure ZKP Record (Hidden)'}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="subtitle2" color="text.secondary">Dates of Validity</Typography>
                                <Typography variant="body1" gutterBottom>
                                    {new Date(certificate.validFrom || certificate.createdAt).toLocaleDateString()} -
                                    {certificate.validUntil ? new Date(certificate.validUntil).toLocaleDateString() : 'N/A'}
                                </Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" color="text.secondary">Remarks / Treatment</Typography>
                                <Typography variant="body1">{certificate.remarks || certificate.treatment || 'None'}</Typography>
                            </Grid>
                        </Grid>
                    </Box>

                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'end',
                        mt: 'auto',
                        pt: 8
                    }}>
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Issued By:</Typography>
                            <Typography variant="body2">{certificate.issuedBy?.name ? `Dr. ${certificate.issuedBy.name}` : certificate.issuedBy}</Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                                Date: {new Date(certificate.createdAt).toLocaleDateString()}
                            </Typography>
                            <Typography variant="caption" sx={{ mt: 2, display: 'block', maxWidth: 300, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                Hash: {certificate.publicCommitmentHash || certificate.verificationHash}
                            </Typography>
                        </Box>

                        <Box sx={{ textAlign: 'center' }}>
                            <QRCodeCanvas value={qrData} size={120} level="H" includeMargin />
                            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                Scan to Verify
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                            Certificate ID: {certificate._id} | Do not alter this digital document.
                        </Typography>
                    </Box>
                </Paper>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default CertificateViewerDialog;
