import { useState, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Tabs,
    Tab,
    Box,
    Typography,
    TextField,
    Alert,
    CircularProgress
} from '@mui/material';
import {
    QrCodeScanner as QrCodeIcon,
    Upload as UploadIcon,
    Keyboard as KeyboardIcon
} from '@mui/icons-material';
import { Scanner } from '@yudiel/react-qr-scanner';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url
).toString();

const PrivateKeyDialog = ({ open, onClose, onSubmit, title = "Provide Private Key" }) => {
    const [tabIndex, setTabIndex] = useState(0);
    const [manualKey, setManualKey] = useState('');
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);
    const [processingFile, setProcessingFile] = useState(false);
    const fileInputRef = useRef(null);

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
        setError('');
        setScanning(newValue === 1); // Start scanning if QR tab is selected
    };

    const submitKey = (key) => {
        if (!key || !key.trim()) {
            setError("Private key cannot be empty.");
            return;
        }
        setError('');
        setScanning(false);
        onSubmit(key.trim());
    };

    const handleManualSubmit = () => {
        submitKey(manualKey);
    };

    const handleScan = (result) => {
        let scanText = result;
        if (Array.isArray(result) && result.length > 0) {
            scanText = result[0].rawValue || result[0].text || result[0].data || String(result[0]);
        } else if (typeof result === 'object' && result !== null) {
            scanText = result.rawValue || result.text || result.data || String(result);
        }

        if (scanText) {
            submitKey(scanText);
        }
    };

    const handleCameraError = (err) => {
        console.error('Camera Error:', err);
        setError('Failed to access camera. Please check permissions or try upload mode.');
        setScanning(false);
    };

    const processFile = async (file) => {
        setProcessingFile(true);
        setError('');

        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'application/pdf'];

        if (!validTypes.includes(file.type) && !isPDF) {
            setError('Please upload a PDF or an image (PNG, JPG, GIF) of the QR code.');
            setProcessingFile(false);
            return;
        }

        try {
            if (isPDF) {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const scale = 2.0;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert"
                });

                if (code) {
                    submitKey(code.data);
                } else {
                    setError('No valid QR code found in the PDF. Please ensure the QR code is clearly visible.');
                }
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: "dontInvert"
                        });

                        if (code) {
                            submitKey(code.data);
                        } else {
                            setError('No valid QR code found in the image. Please ensure the QR code is clearly visible.');
                        }
                        setProcessingFile(false);
                    };
                    img.onerror = () => {
                        setError('Failed to load image.');
                        setProcessingFile(false);
                    }
                    img.src = e.target.result;
                };
                reader.onerror = () => {
                    setError('Failed to read file.');
                    setProcessingFile(false);
                }
                reader.readAsDataURL(file);
                return; // handle async image load
            }
        } catch (err) {
            setError(`Error processing file: ${err.message}`);
        }
        setProcessingFile(false);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            processFile(file);
        }
        event.target.value = '';
    };

    const handleClose = () => {
        setScanning(false);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent dividers>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs value={tabIndex} onChange={handleTabChange} aria-label="private key input methods" variant="fullWidth">
                        <Tab icon={<KeyboardIcon />} label="Manual Entry" />
                        <Tab icon={<QrCodeIcon />} label="Scan QR" />
                        <Tab icon={<UploadIcon />} label="Upload File" />
                    </Tabs>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Tab 1: Manual Entry */}
                {tabIndex === 0 && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" paragraph>
                            Paste your X25519 Private Key below.
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            rows={4}
                            variant="outlined"
                            placeholder="Paste your private key here..."
                            value={manualKey}
                            onChange={(e) => setManualKey(e.target.value)}
                        />
                    </Box>
                )}

                {/* Tab 2: Scan QR Code */}
                {tabIndex === 1 && (
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" paragraph>
                            Position the QR code within the frame to scan.
                        </Typography>
                        <Box sx={{
                            width: '100%',
                            maxWidth: 400,
                            aspectRatio: '4/3',
                            overflow: 'hidden',
                            borderRadius: 2,
                            border: '2px dashed #ccc',
                            position: 'relative'
                        }}>
                            {scanning && (
                                <Scanner
                                    onScan={(result) => {
                                        if (result && scanning) {
                                            handleScan(result);
                                        }
                                    }}
                                    onError={handleCameraError}
                                    options={{ delay: 300 }}
                                    styles={{ container: { width: '100%', height: '100%' } }}
                                />
                            )}
                        </Box>
                    </Box>
                )}

                {/* Tab 3: Upload File */}
                {tabIndex === 2 && (
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" paragraph>
                            Upload a PDF or image of your ID card containing the QR code.
                        </Typography>
                        <Box
                            sx={{
                                border: '2px dashed #ccc',
                                borderRadius: 2,
                                p: 4,
                                width: '100%',
                                textAlign: 'center',
                                cursor: processingFile ? 'default' : 'pointer',
                                bgcolor: '#f9f9f9',
                                '&:hover': { bgcolor: processingFile ? '#f9f9f9' : '#f0f0f0' }
                            }}
                            onClick={() => !processingFile && fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                hidden
                                ref={fileInputRef}
                                accept=".pdf,.png,.jpg,.jpeg,.gif,image/*,application/pdf"
                                onChange={handleFileUpload}
                            />
                            {processingFile ? (
                                <CircularProgress size={32} sx={{ mb: 2 }} />
                            ) : (
                                <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            )}
                            <Typography variant="body1">
                                {processingFile ? "Processing file..." : "Click to select a file"}
                            </Typography>
                        </Box>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                {tabIndex === 0 && (
                    <Button onClick={handleManualSubmit} variant="contained" color="primary">
                        Submit Key
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default PrivateKeyDialog;
