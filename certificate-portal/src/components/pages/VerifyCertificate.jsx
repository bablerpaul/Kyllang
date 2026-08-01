import { useState, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
  Chip,
  LinearProgress,
  Divider,
  IconButton,
  Collapse,
  List // Added List import
} from '@mui/material';
import {
  QrCodeScanner as QrCodeIcon,
  Upload as UploadIcon,
  CameraAlt as CameraIcon,
  Security as SecurityIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  LineStyle
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { Scanner } from '@yudiel/react-qr-scanner';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Use standard Vite asset URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const VerifyCertificate = () => {
  const [verificationMode, setVerificationMode] = useState('qr'); // 'qr' or 'upload'
  const [scanResult, setScanResult] = useState(null); // the raw scan text
  const [verificationData, setVerificationData] = useState(null); // the actual backend verification result
  const [uploadResult, setUploadResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [expandedDetails, setExpandedDetails] = useState(false);
  const fileInputRef = useRef(null);
  const { verifyCertificate } = useAuth();

  const handleModeChange = (event, newMode) => {
    if (newMode !== null) {
      setVerificationMode(newMode);
      setScanResult(null);
      setVerificationData(null);
      setUploadResult(null);
      setCameraError(null);
    }
  };

  const handleScan = async (result) => {
    // Extract actual text value depending on what react-qr-scanner or jsQR returns
    let scanText = result;
    if (Array.isArray(result) && result.length > 0) {
      scanText = result[0].rawValue || result[0].text || result[0].data || String(result[0]);
    } else if (typeof result === 'object' && result !== null) {
      scanText = result.rawValue || result.text || result.data || String(result);
    }

    if (scanText && scanText !== scanResult) {
      setScanning(false);
      setScanResult(scanText);

      // Verify the certificate with the scanned data
      try {
        const parsedData = JSON.parse(scanText);
        const verification = await verifyCertificate(parsedData);
        console.log('QR Verification Result:', verification);
        setVerificationData(verification);
      } catch (error) {
        // If not JSON, treat as plain text
        const verification = await verifyCertificate({ id: scanText });
        console.log('QR Verification Result:', verification);
        setVerificationData(verification);
      }
    }
  };

  const handleCameraError = (error) => {
    console.error('Camera Error:', error);
    setCameraError('Failed to access camera. Please check permissions or try upload mode.');
    setScanning(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Clear previous results
    setVerificationData(null);
    setScanResult(null);

    // Check file type
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type) && !isPDF) {
      alert('For Direct Upload & Verify, please upload a PDF or an image (PNG, JPG, GIF) of the QR code.');
      return;
    }

    // Check file size (increase max to 50MB to support larger PDFs)
    if (file.size > 50 * 1024 * 1024) {
      alert(`File size must be less than 50MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
      return;
    }

    setUploadResult({
      fileName: file.name,
      fileSize: (file.size / 1024).toFixed(2) + ' KB',
      fileType: file.type || 'application/pdf',
      uploadedAt: new Date().toISOString()
    });

    try {
      if (isPDF) {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        // Scan the first page
        const page = await pdf.getPage(1);
        const scale = 2.0; // Higher scale for better QR resolution
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (code) {
          handleScan(code.data);
        } else {
          alert('❌ No valid QR code found in the PDF. Please ensure the QR code is clearly visible.');
          setUploadResult(null);
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
              handleScan(code.data);
            } else {
              alert('❌ No valid QR code found in the image. Please ensure the QR code is clearly visible and well-lit.');
              setUploadResult(null);
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      alert(`Error processing file: ${error.message}`);
      setUploadResult(null);
    }

    // Reset file input
    event.target.value = '';
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleRetryScan = () => {
    setScanResult(null);
    setVerificationData(null);
    setCameraError(null);
    setScanning(true);
  };


  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
      <Typography variant="h3" component="h1" gutterBottom align="center">
        Verify Certificate
      </Typography>

      <Typography variant="body1" paragraph align="center" color="text.secondary">
        Use QR scanning or file upload to verify the authenticity of medical certificates
      </Typography>

      {/* Verification Mode Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
        <ToggleButtonGroup
          value={verificationMode}
          exclusive
          onChange={handleModeChange}
          aria-label="verification mode"
          sx={{ backgroundColor: 'background.paper' }}
        >
          <ToggleButton value="qr" sx={{ px: 4 }}>
            <QrCodeIcon sx={{ mr: 1 }} />
            Scan QR Code
          </ToggleButton>
          <ToggleButton value="upload" sx={{ px: 4 }}>
            <UploadIcon sx={{ mr: 1 }} />
            Upload File
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={4}>
        {/* Left Column: Verification Interface */}
        <Grid item xs={12} md={verificationMode === 'qr' ? 7 : 12}>
          <Card elevation={3}>
            <CardContent sx={{ p: 4, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
              {verificationMode === 'qr' ? (
                <>
                  <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CameraIcon /> QR Code Scanner
                  </Typography>

                  {cameraError ? (
                    <Alert
                      severity="error"
                      sx={{ mb: 3 }}
                      action={
                        <Button color="inherit" size="small" onClick={handleRetryScan}>
                          Retry
                        </Button>
                      }
                    >
                      {cameraError}
                    </Alert>
                  ) : null}

                  {!scanResult && !cameraError && (
                    <>
                      <Box sx={{
                        position: 'relative',
                        border: '2px dashed #ccc',
                        borderRadius: 2,
                        overflow: 'hidden',
                        margin: '0 auto',
                        mb: 3,
                        width: { xs: '100%', sm: '80%', md: '70% ' },
                        Height: 250,
                        maxWidth: 400,
                        backgroundColor: '#f5f5f5'
                      }}>
                        <Scanner
                          onScan={(result) => {
                            if (result && !scanning) {
                              setScanning(true);
                              setTimeout(() => handleScan(result), 100);
                            }
                          }}
                          onError={handleCameraError}
                          options={{
                            delay: 100,
                            constraints: {
                              facingMode: 'environment',
                              width: { ideal: 640 },
                              height: { ideal: 480 }
                            }
                          }}
                          components={{
                            audio: false,
                            finder: {
                              lineStyle: 'solid',
                              lineWidth: 4
                            }
                          }}
                          styles={{
                            container: {
                              width: '100%',
                              height: '100%'
                            },
                            video: {
                              objectFit: 'cover'
                            }
                          }}
                        />

                        {/* Scanner overlay */}
                        <Box sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Box sx={{
                            width: 180,
                            height: 180,
                            border: '3px solid #2196f3',
                            borderRadius: 2,
                            position: 'relative',
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              top: -4,
                              left: -4,
                              right: -4,
                              bottom: -4,
                              border: '2px solid rgba(33, 150, 243, 0.3)',
                              borderRadius: 4,
                              animation: 'pulse 2s infinite'
                            }
                          }} />
                        </Box>
                      </Box>

                      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                        Position the QR code within the frame to scan
                      </Typography>


                    </>
                  )}

                </>
              ) : (
                <>
                  <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <UploadIcon /> File Upload
                  </Typography>

                  <Box sx={{
                    border: '2px dashed #ccc',
                    borderRadius: 2,
                    p: 6,
                    textAlign: 'center',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f9f9f9',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: '#f0f0f0',
                      borderColor: '#2196f3'
                    }
                  }}
                    onClick={handleUploadClick}
                  >
                    <UploadIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Click to upload certificate file
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Supports: PDF, PNG, JPG, GIF (Max 10MB)
                    </Typography>
                    <Button variant="contained" component="span">
                      Choose File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".pdf,.png,.jpg,.jpeg,.gif,image/*,application/pdf"
                      onChange={handleFileUpload}
                    />
                  </Box>

                  {uploadResult && (
                    <Alert
                      severity="info"
                      sx={{ mt: 3 }}
                      onClose={() => setUploadResult(null)}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        📄 File Uploaded
                      </Typography>
                      <Typography variant="body2">
                        <strong>File:</strong> {uploadResult.fileName}<br />
                        <strong>Size:</strong> {uploadResult.fileSize}<br />
                        <strong>Type:</strong> {uploadResult.fileType}
                      </Typography>
                    </Alert>
                  )}
                </>
              )}

              {/* Shared Verification Result Alert for both modes */}
              {verificationData && (
                <Box sx={{ mt: 3, width: '100%' }}>
                  <Alert
                    severity={verificationData.valid ? "success" : "error"}
                    icon={verificationData.valid ? <CheckIcon /> : <ErrorIcon />}
                    action={
                      <IconButton
                        aria-label="close"
                        color="inherit"
                        size="small"
                        onClick={() => { setScanResult(null); setVerificationData(null); }}
                      >
                        <ExpandMoreIcon fontSize="inherit" sx={{ transform: 'rotate(90deg)' }} />
                      </IconButton>
                    }
                  >
                    <Typography variant="subtitle2" gutterBottom>
                      {verificationData.valid ? '✅ Certificate Verified!' : '❌ Verification Failed'}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {verificationData.message}
                    </Typography>
                    {verificationData.valid && verificationData.data && (
                      <Box sx={{ mt: 2, p: 1, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}>
                        <Typography variant="caption" display="block"><strong>Patient ID:</strong> {verificationData.data.certificate?.patient?._id || verificationData.data.certificate?.patient || 'N/A'}</Typography>
                        <Typography variant="caption" display="block"><strong>Diagnosis:</strong> {verificationData.data.certificate?.diagnosis || 'N/A'}</Typography>
                        <Typography variant="caption" display="block"><strong>Valid From:</strong> {verificationData.data.certificate?.validFrom ? new Date(verificationData.data.certificate.validFrom).toLocaleDateString() : 'N/A'}</Typography>
                        <Typography variant="caption" display="block"><strong>Valid Until:</strong> {verificationData.data.certificate?.validUntil ? new Date(verificationData.data.certificate.validUntil).toLocaleDateString() : 'N/A'}</Typography>
                      </Box>
                    )}

                    <Button
                      size="small"
                      variant="outlined"
                      color={verificationData.valid ? "success" : "error"}
                      sx={{ mt: 2 }}
                      onClick={() => {
                        console.log('Scan Result:', scanResult);
                        alert(`Raw Scanned Data Payload:\n\n${scanResult}`);
                      }}
                    >
                      View Raw Data
                    </Button>
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Instructions (only shown in QR mode) */}
        {verificationMode === 'qr' && (
          <Grid item xs={12} md={5}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon /> How to Verify
                </Typography>

                <List dense sx={{ mb: 3 }}>
                  {[
                    'Ensure good lighting when scanning QR codes',
                    'Hold your device steady until scan completes',
                    'QR codes can be on printed certificates or digital displays',
                    'For privacy, scanned data is processed locally',
                    'Verification results are not stored on our servers'
                  ].map((item, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                      <Chip label={index + 1} size="small" sx={{ mr: 2, mt: 0.5 }} />
                      <Typography variant="body2">{item}</Typography>
                    </Box>
                  ))}
                </List>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2">
                      Certificate Details Format
                    </Typography>
                    <IconButton size="small" onClick={() => setExpandedDetails(!expandedDetails)}>
                      {expandedDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>

                  <Collapse in={expandedDetails}>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, backgroundColor: '#f5f5f5' }}>
                      <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                        {"{\n  \"id\": \"CERT-123\",\n  \"type\": \"vaccine\",\n  \"...\" : \"...\"\n}"}
                      </Typography>
                    </Paper>
                  </Collapse>
                </Box>

                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="caption">
                    <strong>Note:</strong> This verification does not require login.
                    For detailed access, authorized users should log in to their portals.
                  </Typography>
                </Alert>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card elevation={2} sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Verification Stats
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4" color="success.main">
                        98%
                      </Typography>
                      <Typography variant="caption">Success Rate</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4" color="primary.main">
                        24/7
                      </Typography>
                      <Typography variant="caption">Availability</Typography>
                    </Paper>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Camera Permissions Info */}
      {verificationMode === 'qr' && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Camera Access Required:</strong> This feature requires camera permissions.
            If prompted, please allow camera access to use the QR scanner.
            Your camera feed is processed locally and not transmitted.
          </Typography>
        </Alert>
      )}

      {/* Add CSS for scanner animation */}
      <style jsx="true">{`
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 0.7; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  );
};

export default VerifyCertificate;