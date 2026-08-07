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
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const CertificateViewerDialog = ({ open, onClose, certificate }) => {
    const printRef = useRef();

    const handleDownloadPdf = async () => {
        const element = printRef.current;
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
            });
            const dataUrl = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
    const qrData = JSON.stringify({
        data: {
            patientId: pId,
            diagnosis: certificate.diagnosis,
            validFrom: certificate.validFrom ? certificate.validFrom.split('T')[0] : certificate.validFrom,
            validUntil: certificate.validUntil ? certificate.validUntil.split('T')[0] : certificate.validUntil
        },
        hash: certificate.verificationHash
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
                                <Typography variant="body1" gutterBottom>{certificate.diagnosis || certificate.type || 'N/A'}</Typography>
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
                                Hash: {certificate.verificationHash}
                            </Typography>
                        </Box>

                        <Box sx={{ textAlign: 'center' }}>
                            <QRCodeSVG value={qrData} size={120} level="H" includeMargin />
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
