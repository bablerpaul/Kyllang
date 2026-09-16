import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  Stack,
  Chip
} from '@mui/material';
import { CloudUpload as CloudUploadIcon, CheckCircle as CheckCircleIcon, Cancel as CancelIcon } from '@mui/icons-material';
import axios from 'axios';

// Dynamically import pdfjs-dist when needed
const loadPdfJs = async () => {
  const pdfjsLib = await import('pdfjs-dist/build/pdf');
  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  return pdfjsLib;
};

const ZKPVerifyForm = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  
  const [manualMode, setManualMode] = useState(false);
  const [verifyProofJson, setVerifyProofJson] = useState('');
  const [verifyPublicSignals, setVerifyPublicSignals] = useState('');
  const [verifyCommitment, setVerifyCommitment] = useState('');
  const [verifyPublicInputs, setVerifyPublicInputs] = useState('');
  
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setExtractError('');
      setExtractedData(null);
      setVerificationResult(null);
    } else {
      setExtractError('Please select a valid PDF file');
    }
  };

  const handleExtractFromPDF = async () => {
    if (!selectedFile) return;
    
    setExtracting(true);
    setExtractError('');
    setExtractedData(null);
    
    try {
      const text = await readPDFAsText(selectedFile);
      
      const startMarker = '--- BEGIN ZKP PROOF DATA ---';
      const endMarker = '--- END ZKP PROOF DATA ---';
      
      const startIndex = text.indexOf(startMarker);
      const endIndex = text.indexOf(endMarker);
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('Could not find ZKP proof data in the PDF document.');
      }
      
      const jsonString = text.substring(startIndex + startMarker.length, endIndex).trim();
      const data = JSON.parse(jsonString);
      
      if (!data.proof || !data.public_signals || !data.commitment) {
        throw new Error('Invalid ZKP proof structure found in the document.');
      }
      
      if (!data.public_inputs) {
        data.public_inputs = [];
      }
      
      setExtractedData(data);
      setVerifyProofJson(JSON.stringify(data.proof, null, 2));
      setVerifyPublicSignals(data.public_signals.join(', '));
      setVerifyCommitment(data.commitment);
      setVerifyPublicInputs(data.public_inputs.join(', '));
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        setExtractError('Failed to parse the extracted proof data. It may be corrupted.');
      } else {
        setExtractError(error.message || 'Failed to extract proof from PDF.');
      }
    } finally {
      setExtracting(false);
    }
  };

  const readPDFAsText = async (file) => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    const beginMarker = '--- BEGIN ZKP PROOF DATA ---';
    const endMarker = '--- END ZKP PROOF DATA ---';
    
    const beginIdx = fullText.indexOf(beginMarker);
    const endIdx = fullText.indexOf(endMarker);
    
    if (beginIdx !== -1 && endIdx !== -1) {
      let jsonStr = fullText.substring(beginIdx + beginMarker.length, endIdx);
      jsonStr = jsonStr
        .replace(/\s+/g, ' ')
        .replace(/"\s*:\s*/g, '": ')
        .replace(/,\s*/g, ', ')
        .replace(/\{\s*/g, '{ ')
        .replace(/\s*\}/g, ' }')
        .replace(/\[\s*/g, '[ ')
        .replace(/\s*\]/g, ' ]')
        .trim();
      
      try {
        JSON.parse(jsonStr);
        return `${beginMarker}\n${jsonStr}\n${endMarker}`;
      } catch {
        // Fall through to reconstruction
      }
    }
    
    // Fallback: Regex extraction
    const rMatch = fullText.match(/["']?R["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const sMatch = fullText.match(/["']?s["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const challengeMatch = fullText.match(/["']?challenge["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const commitmentMatch = fullText.match(/["']?commitment["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    
    let publicInputs = [];
    const publicInputsMatch = fullText.match(/["']?public_inputs["']?\s*:\s*\[([^\]]*)\]/);
    if (publicInputsMatch && publicInputsMatch[1].trim()) {
      const stringMatches = publicInputsMatch[1].match(/["']([^"']+)["']/g);
      if (stringMatches) {
        publicInputs = stringMatches.map(s => s.replace(/["']/g, ''));
      }
    }
    
    let signals = [];
    const signalsMatch = fullText.match(/["']?public_signals["']?\s*:\s*\[([^\]]*)\]/);
    if (signalsMatch) {
      const hexMatches = signalsMatch[1].match(/0x[a-fA-F0-9]+/g);
      if (hexMatches) signals = hexMatches;
    }
    
    if (rMatch && sMatch && challengeMatch && commitmentMatch) {
      if (signals.length === 0) signals = [commitmentMatch[1]];
      
      const reconstructed = {
        proof: {
          R: rMatch[1],
          s: sMatch[1],
          challenge: challengeMatch[1]
        },
        public_signals: signals,
        commitment: commitmentMatch[1],
        public_inputs: publicInputs
      };
      
      return `${beginMarker}\n${JSON.stringify(reconstructed, null, 2)}\n${endMarker}`;
    }
    
    throw new Error('Could not find proof data in PDF. Try manual input.');
  };

  const handleVerifyProof = async () => {
    let proof, publicSignalsArray, commitment, publicInputsArray;
    
    if (extractedData && !manualMode) {
      proof = extractedData.proof;
      publicSignalsArray = extractedData.public_signals;
      commitment = extractedData.commitment;
      publicInputsArray = extractedData.public_inputs || [];
    } else {
      if (!verifyProofJson.trim() || !verifyCommitment.trim()) {
        setVerifyError('Please fill in all required fields');
        return;
      }
      
      try {
        proof = JSON.parse(verifyProofJson);
      } catch {
        setVerifyError('Invalid JSON format for proof');
        return;
      }
      
      publicSignalsArray = verifyPublicSignals
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      commitment = verifyCommitment;
      publicInputsArray = verifyPublicInputs
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    setVerifying(true);
    setVerifyError('');
    setVerificationResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/certificates/verify-zkp', {
        proof: proof,
        public_signals: publicSignalsArray,
        commitment: commitment,
        public_inputs: publicInputsArray,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setVerificationResult(response.data.data);
      } else {
        setVerifyError(response.data.message || 'Verification failed');
      }
    } catch (error) {
      setVerifyError(error.response?.data?.message || error.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setExtractError('');
    setVerifyProofJson('');
    setVerifyPublicSignals('');
    setVerifyCommitment('');
    setVerifyPublicInputs('');
    setVerificationResult(null);
    setVerifyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto', mt: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)' }}>
      <Typography variant="h5" gutterBottom fontWeight="bold" sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircleIcon /> Zero-Knowledge Proof (ZKP) Verification
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Upload a medical certificate (PDF) to verify its cryptographic authenticity without revealing its underlying cryptographic secrets.
      </Typography>

      <Box sx={{ mb: 3, mt: 2 }}>
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button 
            variant={!manualMode ? 'contained' : 'outlined'} 
            onClick={() => setManualMode(false)}
            fullWidth
          >
            Upload PDF Certificate
          </Button>
          <Button 
            variant={manualMode ? 'contained' : 'outlined'} 
            onClick={() => setManualMode(true)}
            fullWidth
          >
            Manual Proof Entry
          </Button>
        </Stack>

        {!manualMode ? (
          <Box>
            <Box
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                p: 5,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'action.hover' },
                transition: 'all 0.3s'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              {selectedFile ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">{selectedFile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{(selectedFile.size / 1024).toFixed(1)} KB</Typography>
                </Box>
              ) : (
                <Box>
                  <Typography variant="subtitle1">Click or drag & drop to upload PDF</Typography>
                  <Typography variant="body2" color="text.secondary">Only Kyllang-issued certificates are supported</Typography>
                </Box>
              )}
            </Box>

            {extractError && <Alert severity="error" sx={{ mt: 2 }}>{extractError}</Alert>}

            {selectedFile && !extractedData && (
              <Button
                variant="contained"
                color="secondary"
                fullWidth
                sx={{ mt: 2 }}
                onClick={handleExtractFromPDF}
                disabled={extracting}
              >
                {extracting ? <CircularProgress size={24} color="inherit" /> : 'Extract Cryptographic Proof'}
              </Button>
            )}

            {extractedData && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Proof data successfully extracted! Commitment ID: {extractedData.commitment.substring(0, 10)}...
              </Alert>
            )}
          </Box>
        ) : (
          <Stack spacing={3}>
            <TextField
              label="Proof (JSON format)"
              multiline
              rows={4}
              value={verifyProofJson}
              onChange={(e) => setVerifyProofJson(e.target.value)}
              placeholder='{"R": "0x...", "s": "0x...", "challenge": "0x..."}'
              fullWidth
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />
            <TextField
              label="Public Signals (comma-separated)"
              value={verifyPublicSignals}
              onChange={(e) => setVerifyPublicSignals(e.target.value)}
              placeholder="e.g. 0x1234..., 0x5678..."
              fullWidth
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />
            <TextField
              label="Commitment (Hex)"
              value={verifyCommitment}
              onChange={(e) => setVerifyCommitment(e.target.value)}
              placeholder="0x..."
              fullWidth
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />
            <TextField
              label="Public Inputs (comma-separated)"
              value={verifyPublicInputs}
              onChange={(e) => setVerifyPublicInputs(e.target.value)}
              placeholder="e.g. patient123, flu, 2024-01-01"
              fullWidth
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />
          </Stack>
        )}

        {verifyError && <Alert severity="error" sx={{ mt: 2 }}>{verifyError}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={handleVerifyProof}
            disabled={verifying || (!extractedData && !manualMode) || (manualMode && (!verifyProofJson || !verifyCommitment))}
          >
            {verifying ? <CircularProgress size={24} color="inherit" /> : 'Verify Proof Authenticity'}
          </Button>

          {(selectedFile || extractedData || verificationResult) && (
            <Button variant="outlined" color="inherit" onClick={handleReset} fullWidth>
              Reset Form
            </Button>
          )}
        </Stack>

        {verificationResult && (
          <Box sx={{ mt: 4 }}>
            <Divider sx={{ mb: 3 }} />
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Verification Result</Typography>
              <Chip 
                icon={verificationResult.valid ? <CheckCircleIcon /> : <CancelIcon />} 
                label={verificationResult.valid ? 'VALID PROOF' : 'INVALID PROOF'} 
                color={verificationResult.valid ? 'success' : 'error'} 
                variant="filled"
              />
            </Box>

            <Paper sx={{ p: 3, bgcolor: verificationResult.valid ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', border: '1px solid', borderColor: verificationResult.valid ? 'success.main' : 'error.main' }}>
              <Typography variant="subtitle1" fontWeight="bold" color={verificationResult.valid ? 'success.main' : 'error.main'}>
                {verificationResult.valid ? 'Cryptographic Proof is Valid' : 'Cryptographic Proof is Invalid'}
              </Typography>
              
              {verificationResult.certificate && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2"><strong>Patient:</strong> {verificationResult.certificate.patient?.name}</Typography>
                  <Typography variant="body2"><strong>Issued By:</strong> Dr. {verificationResult.certificate.issuedBy?.name}</Typography>
                  <Typography variant="body2"><strong>Diagnosis:</strong> {verificationResult.certificate.diagnosis}</Typography>
                  <Typography variant="body2"><strong>Valid Until:</strong> {new Date(verificationResult.certificate.validUntil).toLocaleDateString()}</Typography>
                </Box>
              )}

              {verificationResult.details && (
                <Box sx={{ mt: 3, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  <Typography variant="overline" color="text.secondary">Technical Details</Typography>
                  <Box display="flex" justifyContent="space-between">
                    <span>Fiat-Shamir Challenge Valid:</span>
                    <span style={{ color: verificationResult.details.challenge_valid ? '#4caf50' : '#f44336' }}>{verificationResult.details.challenge_valid ? 'YES' : 'NO'}</span>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <span>Proof Structure Valid:</span>
                    <span style={{ color: verificationResult.details.proof_structure_valid ? '#4caf50' : '#f44336' }}>{verificationResult.details.proof_structure_valid ? 'YES' : 'NO'}</span>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <span>Database Commitment Match:</span>
                    <span style={{ color: verificationResult.details.commitment_verified ? '#4caf50' : '#f44336' }}>{verificationResult.details.commitment_verified ? 'YES' : 'NO'}</span>
                  </Box>
                </Box>
              )}
            </Paper>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ZKPVerifyForm;
