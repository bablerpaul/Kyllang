import React, { useState, useRef, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, Alert, Chip,
  Card, CardContent, Divider, CircularProgress, Tooltip, IconButton,
  Tabs, Tab, LinearProgress,
} from '@mui/material';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist';
import { apiFetch } from '../../utils/api';

// Point pdfjs-dist at the local worker bundled in node_modules (served by Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan a canvas element for a QR code using jsQR.
 */
function scanCanvasForQR(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imageData.data, imageData.width, imageData.height);
}

/**
 * Render the first page of a PDF to a canvas and return a QR code scan result.
 */
async function extractQRFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const logs = [];

  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 4); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 3.0 }); // high DPI for better QR detection
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const qr = scanCanvasForQR(canvas);
    if (qr) {
      logs.push(`✓ QR found on page ${pageNum}`);
      return { text: qr.data, logs };
    }
    logs.push(`Page ${pageNum}: no QR detected.`);
  }
  return { text: null, logs };
}

/**
 * Scan an image file for a QR code.
 */
function extractQRFromImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const qr = scanCanvasForQR(canvas);
      resolve({ text: qr?.data || null, logs: qr ? ['✓ QR found in image'] : ['No QR code detected in image.'] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ text: null, logs: ['Failed to load image.'] });
    };
    img.src = url;
  });
}

/**
 * Parse a QR payload — could be a raw hash string or a JSON Kyllang payload.
 */
function parseQRPayload(rawText) {
  if (!rawText) return null;
  // Try JSON first (Kyllang-issued certificate QRs)
  try {
    const obj = JSON.parse(rawText);
    // Kyllang QR format: { type, hash, patientName, issuer, validFrom, validUntil, ... }
    if (obj.hash || obj.commitmentHash || obj.certificateHash) {
      return {
        hash: obj.hash || obj.commitmentHash || obj.certificateHash,
        meta: obj,
      };
    }
    // ZK challenge QR — different format
    if (obj.type === 'kyllang_challenge') {
      return { hash: null, meta: obj, isChallenge: true };
    }
  } catch (_) {}
  // Treat raw text as a hash
  const trimmed = rawText.trim();
  if (/^[a-fA-F0-9]{32,128}$/.test(trimmed)) {
    return { hash: trimmed, meta: null };
  }
  // Could be a URL with a hash param
  try {
    const url = new URL(trimmed);
    const h = url.searchParams.get('hash') || url.searchParams.get('h');
    if (h) return { hash: h, meta: { sourceUrl: trimmed } };
  } catch (_) {}
  // Return raw as hash anyway
  return { hash: trimmed, meta: null };
}

// ── Result Card ──────────────────────────────────────────────────────────────
function VerificationResult({ result, onReset }) {
  const isValid = result.status === 'valid' || result.verified === true;
  const isError = result.status === 'error';

  return (
    <Card
      elevation={0}
      sx={{
        border: `2px solid ${isError ? '#f59e0b' : isValid ? '#16a34a' : '#dc2626'}`,
        borderRadius: '12px',
        bgcolor: isError ? '#fffbeb' : isValid ? '#f0fdf4' : '#fef2f2',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            {isError ? (
              <Chip label="⚠ UNVERIFIABLE" color="warning" sx={{ fontWeight: 700 }} />
            ) : isValid ? (
              <CheckCircleIcon color="success" fontSize="large" />
            ) : (
              <CancelIcon color="error" fontSize="large" />
            )}
            <Box>
              <Typography variant="h6" sx={{
                fontWeight: 700,
                color: isError ? '#92400e' : isValid ? '#15803d' : '#b91c1c',
              }}>
                {isError
                  ? 'Verification Inconclusive'
                  : isValid
                    ? 'Cryptographically Verified ✓'
                    : 'Verification Failed ✗'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {result.message || (isValid ? 'Hash matches on-chain registry' : 'Hash not found in registry')}
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Reset">
            <IconButton size="small" onClick={onReset}><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Grid container spacing={1.5}>
          {result.patientName && (
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Patient</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.patientName}</Typography>
            </Grid>
          )}
          {result.doctorName && (
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Issuing Doctor</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.doctorName}</Typography>
            </Grid>
          )}
          {result.diagnosis && (
            <Grid item xs={12}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Diagnosis / Purpose</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.diagnosis}</Typography>
            </Grid>
          )}
          {(result.validFrom || result.issuedAt) && (
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Valid From</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {result.validFrom || new Date(result.issuedAt).toLocaleDateString('en-IN')}
              </Typography>
            </Grid>
          )}
          {result.validUntil && (
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Valid Until</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.validUntil}</Typography>
            </Grid>
          )}
          {result.blockchainHash && (
            <Grid item xs={12}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Blockchain Hash</Typography>
              <Box sx={{ p: 1, bgcolor: '#f1f5f9', borderRadius: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {result.blockchainHash}
                </Typography>
              </Box>
            </Grid>
          )}
          {result.hash && (
            <Grid item xs={12}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Verified Hash</Typography>
              <Box sx={{ p: 1, bgcolor: '#f1f5f9', borderRadius: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {result.hash}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function QRVerificationManager() {
  const [tab, setTab] = useState(0); // 0=hash, 1=upload
  const [inputHash, setInputHash] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanLogs, setScanLogs] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setResult(null);
    setError('');
    setScanLogs([]);
    setInputHash('');
  };

  // ── Verify a hash against the backend ──────────────────────────────────────
  const verifyHash = useCallback(async (hash, meta = null) => {
    if (!hash?.trim()) {
      setError('Please enter a hash or upload a document containing a QR code.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // URL-encode the hash so base64 characters (/, +, =) don't break the route
      const encoded = encodeURIComponent(hash.trim());
      const res = await apiFetch(`/api/certificates/lookup/${encoded}`);
      const data = res?.data || res || {};
      setResult({
        ...data,
        hash: hash.trim(),
        status: data.status || 'verified',
      });
    } catch (err) {
      if (err.message?.includes('404') || err.message?.toLowerCase().includes('not found')) {
        setResult({
          status: 'invalid',
          hash: hash.trim(),
          message: 'This hash is not registered in the Kyllang certificate registry.',
        });
      } else {
        setResult({
          status: 'error',
          hash: hash.trim(),
          message: `Verification service error: ${err.message}`,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Handle hash form submit ────────────────────────────────────────────────
  const handleHashSubmit = (e) => {
    e.preventDefault();
    const parsed = parseQRPayload(inputHash);
    verifyHash(parsed?.hash || inputHash, parsed?.meta);
  };

  // ── Handle file upload (PDF or image) ─────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    setScanLogs([]);

    const isPDF   = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');

    if (!isPDF && !isImage) {
      setError('Unsupported file type. Please upload a PDF or an image (PNG, JPG, WEBP).');
      setLoading(false);
      return;
    }

    try {
      setScanLogs(['Scanning document for QR code…']);
      let scanResult;
      if (isPDF) {
        scanResult = await extractQRFromPDF(file);
      } else {
        scanResult = await extractQRFromImage(file);
      }

      setScanLogs(scanResult.logs);

      if (!scanResult.text) {
        setError('No QR code found in this document. Make sure the document contains a Kyllang-issued certificate QR code and is not too blurry or small.');
        setLoading(false);
        return;
      }

      setScanLogs(prev => [...prev, `QR payload: ${scanResult.text.slice(0, 60)}${scanResult.text.length > 60 ? '…' : ''}`]);

      const parsed = parseQRPayload(scanResult.text);

      if (parsed?.isChallenge) {
        setError('This QR is a ZK Challenge QR (for patient authentication), not a certificate QR. Use the Patient Verification flow instead.');
        setLoading(false);
        return;
      }

      if (!parsed?.hash) {
        setError(`QR found but could not extract a certificate hash. Raw value: ${scanResult.text}`);
        setLoading(false);
        return;
      }

      setScanLogs(prev => [...prev, `Extracted hash: ${parsed.hash.slice(0, 24)}… Querying registry…`]);
      await verifyHash(parsed.hash, parsed.meta);
    } catch (err) {
      setError(`Document scanning error: ${err.message}`);
      setLoading(false);
    }
  }, [verifyHash]);

  const handleFileInputChange = (e) => handleFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputHash(text);
    } catch (_) {
      setError('Clipboard access denied. Please paste manually.');
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
          QR Code &amp; Hash Verification
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Verify medical certificates by entering a hash, or upload a certificate PDF / image containing a QR code
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Left — Input panel */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); reset(); }} sx={{ mb: 2.5 }}>
              <Tab icon={<SearchIcon />} label="Paste Hash" iconPosition="start" sx={{ textTransform: 'none', fontWeight: 600 }} />
              <Tab icon={<UploadFileIcon />} label="Upload Document" iconPosition="start" sx={{ textTransform: 'none', fontWeight: 600 }} />
            </Tabs>

            {tab === 0 && (
              <form onSubmit={handleHashSubmit}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  Enter the certificate hash, HMAC signature, or full QR payload text from a Kyllang health certificate.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Certificate Hash or QR Payload"
                    placeholder="Paste hash or raw QR text here…"
                    value={inputHash}
                    onChange={(e) => setInputHash(e.target.value)}
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.82rem' } }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<ContentPasteIcon />}
                    onClick={handlePaste}
                    sx={{ textTransform: 'none', flexShrink: 0 }}
                  >
                    Paste
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    type="submit"
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <VerifiedIcon />}
                    disabled={loading || !inputHash.trim()}
                    sx={{ py: 1.2, fontWeight: 600, textTransform: 'none' }}
                  >
                    {loading ? 'Verifying…' : 'Verify Certificate'}
                  </Button>
                </Box>
              </form>
            )}

            {tab === 1 && (
              <Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  Upload a PDF or image of a certificate. The system will scan all pages for an embedded QR code and verify it automatically.
                </Typography>

                {/* Drop zone */}
                <Box
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`,
                    borderRadius: '12px',
                    p: 4,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: dragOver ? 'rgba(37,99,235,0.04)' : '#f8fafc',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: '#2563eb', bgcolor: 'rgba(37,99,235,0.04)' },
                  }}
                >
                  <UploadFileIcon sx={{ fontSize: 48, color: dragOver ? '#2563eb' : '#94a3b8', mb: 1 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: dragOver ? '#2563eb' : '#374151' }}>
                    {loading ? 'Scanning…' : 'Drop PDF or Image here, or click to browse'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                    Supports: PDF, PNG, JPG, WEBP · Max: 20MB
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                  />
                </Box>

                {loading && <LinearProgress sx={{ mt: 2, borderRadius: 2 }} />}

                {/* Scan logs */}
                {scanLogs.length > 0 && (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: '#0f172a', borderRadius: '8px', maxHeight: 120, overflowY: 'auto' }}>
                    {scanLogs.map((log, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: '#7dd3fc', lineHeight: 1.7 }}>
                        &gt; {log}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Right — Result panel */}
        <Grid item xs={12} md={6}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {result ? (
            <VerificationResult result={result} onReset={reset} />
          ) : !loading && !error ? (
            <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '12px', bgcolor: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <QrCodeScannerIcon sx={{ fontSize: 64, color: '#cbd5e1' }} />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#475569' }}>
                  Verification Result
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5, maxWidth: 280, mx: 'auto' }}>
                  Enter a hash or upload a certificate document to see on-chain verification results here.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip label="HMAC-SHA256" size="small" variant="outlined" />
                <Chip label="On-Chain Lookup" size="small" variant="outlined" />
                <Chip label="QR Auto-Scan" size="small" variant="outlined" color="primary" />
              </Box>
            </Paper>
          ) : null}
        </Grid>
      </Grid>

      {/* Info box */}
      <Paper elevation={0} sx={{ mt: 3, p: 2.5, border: '1px solid #e2e8f0', borderRadius: '12px', bgcolor: '#f8fafc' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>How it works</Typography>
        <Grid container spacing={2}>
          {[
            { step: '1', text: 'Get the certificate hash or QR code from a printed / digital Kyllang health certificate.' },
            { step: '2', text: 'Paste the hash in the text box, OR upload the PDF/image. QR codes are extracted automatically from PDFs using jsQR.' },
            { step: '3', text: 'The system sends the hash to POST /api/certificates/verify which checks the on-chain smart contract registry.' },
            { step: '4', text: 'Result shows validity, patient details, issue date, and the on-chain blockchain transaction hash.' },
          ].map(({ step, text }) => (
            <Grid item xs={12} sm={6} key={step}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Chip label={step} size="small" sx={{ fontWeight: 700, minWidth: 28 }} />
                <Typography variant="body2" sx={{ color: '#475569' }}>{text}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
}
