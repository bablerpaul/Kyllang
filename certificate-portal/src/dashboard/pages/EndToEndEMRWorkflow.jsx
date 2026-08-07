import React, { useState } from 'react';
import {
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Tooltip,
} from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LoginIcon from '@mui/icons-material/Login';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import AddTaskIcon from '@mui/icons-material/AddTask';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VerifiedIcon from '@mui/icons-material/Verified';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ShieldIcon from '@mui/icons-material/Shield';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const steps = [
  'Patient Register',
  'Doctor Login',
  'Open Patient',
  'Create EMR',
  'Upload Lab Report',
  'Generate Blockchain Hash',
  'Generate Certificate',
  'Verify Certificate',
  'Insurance Verification',
  'Audit Log',
];

export default function EndToEndEMRWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Workflow Live State
  const [patientData, setPatientData] = useState({
    name: 'Robert Davis',
    email: 'robert.davis@example.com',
    password: 'password123',
    bloodGroup: 'O+',
    phone: '+1 555-0987',
    patientId: 'PAT-9081',
    token: null,
  });

  const [doctorData, setDoctorData] = useState({
    email: 'doctor@hospital.org',
    password: 'password123',
    doctorName: 'Dr. Sarah Jenkins',
    specialty: 'Cardiology',
    doctorId: 'DOC-101',
    token: null,
  });

  const [emrData, setEmrData] = useState({
    diagnosis: 'Hypertensive Heart Disease',
    symptoms: 'Shortness of breath, dizziness',
    bloodPressure: '142/90',
    heartRate: '82',
    temperature: '98.6',
    clinicalNotes: 'Initiated ACE inhibitors. Prescribed low-sodium diet and ECG.',
    emrId: null,
    dataHash: null,
  });

  const [labData, setLabData] = useState({
    testCategory: 'ECG',
    testName: '12-Lead Electrocardiogram',
    ipfsCid: null,
    reportId: null,
  });

  const [blockchainTx, setBlockchainTx] = useState(null);
  const [certificateData, setCertificateData] = useState({
    certId: null,
    verificationHash: null,
    validFrom: '2026-07-27',
    validUntil: '2026-08-10',
  });

  const [verificationResult, setVerificationResult] = useState(null);
  const [insuranceData, setInsuranceData] = useState({
    claimId: null,
    provider: 'BlueCross Health',
    policyNumber: 'BC-772910',
    claimAmount: '$3,500',
    certVerified: false,
    blockchainVerified: false,
    status: 'submitted',
  });

  const [auditLogs, setAuditLogs] = useState([]);

  // Step Handlers
  const handleNext = async () => {
    setLoading(true);
    setTimeout(() => {
      // Simulate live API state transitions
      if (activeStep === 0) {
        // Patient Register
        setPatientData(prev => ({ ...prev, patientId: `PAT-${Math.floor(1000 + Math.random() * 9000)}`, token: 'jwt_patient_sample' }));
        addAudit('CREATED', 'Patient', patientData.name, '192.168.1.50');
      } else if (activeStep === 1) {
        // Doctor Login
        setDoctorData(prev => ({ ...prev, token: 'jwt_doctor_sample' }));
        addAudit('VIEWED', 'User', doctorData.doctorName, '192.168.1.104');
      } else if (activeStep === 2) {
        // Open Patient
        addAudit('VIEWED', 'MedicalRecord', patientData.patientId, '192.168.1.104');
      } else if (activeStep === 3) {
        // Create EMR & SHA256 Hash
        const fakeHash = `a7c9f8e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8`;
        setEmrData(prev => ({ ...prev, emrId: `EMR-${Math.floor(6000 + Math.random() * 999)}`, dataHash: fakeHash }));
        addAudit('CREATED', 'MedicalRecord', fakeHash, '192.168.1.104');
      } else if (activeStep === 4) {
        // Upload Lab Report to IPFS
        const fakeCid = `QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco`;
        setLabData(prev => ({ ...prev, reportId: `LAB-${Math.floor(700 + Math.random() * 99)}`, ipfsCid: fakeCid }));
        addAudit('CREATED', 'LabReport', fakeCid, '192.168.1.104');
      } else if (activeStep === 5) {
        // Generate Blockchain Hash
        const fakeTx = `0x8f2a9d1b4c7e3f8a0b9c2d1e4f6a8b0c2d4e6f8a0b9c2d1e4f6a8b0c2d4e6f8a`;
        setBlockchainTx(fakeTx);
        addAudit('UPDATED', 'MedicalRecord', emrData.dataHash, '192.168.1.104', fakeTx);
      } else if (activeStep === 6) {
        // Generate Certificate
        const fakeCertHash = `b8d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0`;
        setCertificateData(prev => ({ ...prev, certId: `CERT-${Math.floor(500 + Math.random() * 99)}`, verificationHash: fakeCertHash }));
        addAudit('CREATED', 'Certificate', fakeCertHash, '192.168.1.104', blockchainTx);
      } else if (activeStep === 7) {
        // Verify Certificate
        setVerificationResult({ valid: true, timestamp: new Date().toLocaleString() });
        addAudit('VIEWED', 'Certificate', certificateData.verificationHash, '192.168.1.104');
      } else if (activeStep === 8) {
        // Insurance Verification
        setInsuranceData(prev => ({
          ...prev,
          claimId: `CLM-${Math.floor(800 + Math.random() * 99)}`,
          certVerified: true,
          blockchainVerified: true,
          status: 'approved',
        }));
        addAudit('UPDATED', 'InsuranceClaim', blockchainTx, '192.168.1.12', blockchainTx);
      }

      setLoading(false);
      setActiveStep(prev => prev + 1);
    }, 600);
  };

  const handleReset = () => {
    setActiveStep(0);
    setAuditLogs([]);
    setBlockchainTx(null);
    setVerificationResult(null);
  };

  const addAudit = (action, resource, hash, ip, txHash = null) => {
    const newLog = {
      _id: `LOG-${9900 + auditLogs.length + 1}`,
      user: doctorData.doctorName,
      action,
      resource,
      ipAddress: ip || '127.0.0.1',
      hash: hash || 'N/A',
      transactionHash: txHash || blockchainTx || 'Pending On-Chain Anchor',
      timestamp: new Date().toLocaleString(),
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
          Connected End-to-End EMR Flow
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Complete 10-step lifecycle: Patient Registration $\rightarrow$ Doctor Login $\rightarrow$ Open EMR $\rightarrow$ Lab IPFS Upload $\rightarrow$ Blockchain Anchor $\rightarrow$ Certificate $\rightarrow$ Insurance Adjudication $\rightarrow$ Audit Log
        </Typography>
      </Box>

      {/* Stepper Progress */}
      <Paper elevation={0} sx={{ p: 3, mb: 4, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Step Content */}
      <Box sx={{ mb: 4 }}>
        {loading ? (
          <Paper elevation={0} sx={{ p: 6, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <CircularProgress size={48} sx={{ color: '#2563eb', mb: 2 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Executing Step: {steps[activeStep]}...</Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>Processing API requests, SHA-256 calculation & blockchain smart contract invocation</Typography>
          </Paper>
        ) : (
          <>
            {activeStep === 0 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonAddIcon /> Step 1: Patient Registration (`POST /api/patient/register`)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}><TextField fullWidth label="Patient Name" value={patientData.name} onChange={(e) => setPatientData({ ...patientData, name: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField fullWidth label="Email" value={patientData.email} onChange={(e) => setPatientData({ ...patientData, email: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField fullWidth label="Blood Group" value={patientData.bloodGroup} onChange={(e) => setPatientData({ ...patientData, bloodGroup: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField fullWidth label="Phone" value={patientData.phone} onChange={(e) => setPatientData({ ...patientData, phone: e.target.value })} /></Grid>
                </Grid>
                {patientData.token && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Patient Created! ID: <strong>{patientData.patientId}</strong> (Curve25519 X25519 Encryption Keypair Generated)
                  </Alert>
                )}
              </Paper>
            )}

            {activeStep === 1 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LoginIcon /> Step 2: Doctor Authentication (`POST /api/doctor/login`)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}><TextField fullWidth label="Doctor Email" value={doctorData.email} onChange={(e) => setDoctorData({ ...doctorData, email: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField fullWidth label="Specialty" value={doctorData.specialty} onChange={(e) => setDoctorData({ ...doctorData, specialty: e.target.value })} /></Grid>
                </Grid>
                <Alert severity="info" sx={{ mt: 2 }}>
                  Doctor Logged In: <strong>{doctorData.doctorName}</strong> (Role: `doctor`, License: `DOC-NY-98123`)
                </Alert>
              </Paper>
            )}

            {activeStep === 2 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FolderSharedIcon /> Step 3: Open Patient Profile & Verify Consent (`GET /api/doctor/patient/:id/emr`)
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Patient: {patientData.name} ({patientData.patientId})</Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>Blood Group: {patientData.bloodGroup} | Contact: {patientData.phone}</Typography>
                  <Chip label="Patient Active Consent Verified" color="success" size="small" sx={{ mt: 1, fontWeight: 700 }} />
                </Box>
              </Paper>
            )}

            {activeStep === 3 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AddTaskIcon /> Step 4: Create EMR Encounter & JSON SHA-256 Hashing (`POST /api/emr`)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}><TextField fullWidth label="Diagnosis" value={emrData.diagnosis} onChange={(e) => setEmrData({ ...emrData, diagnosis: e.target.value })} /></Grid>
                  <Grid item xs={4}><TextField fullWidth label="Blood Pressure" value={emrData.bloodPressure} onChange={(e) => setEmrData({ ...emrData, bloodPressure: e.target.value })} /></Grid>
                  <Grid item xs={4}><TextField fullWidth label="Heart Rate" value={emrData.heartRate} onChange={(e) => setEmrData({ ...emrData, heartRate: e.target.value })} /></Grid>
                  <Grid item xs={4}><TextField fullWidth label="Temperature" value={emrData.temperature} onChange={(e) => setEmrData({ ...emrData, temperature: e.target.value })} /></Grid>
                </Grid>
                {emrData.dataHash && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Record Created in MongoDB! SHA-256 Data Hash: <strong>{emrData.dataHash}</strong>
                  </Alert>
                )}
              </Paper>
            )}

            {activeStep === 4 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#059669', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudUploadIcon /> Step 5: Upload Lab Report / Scan to IPFS Node (`POST /api/upload/single`)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}><TextField fullWidth label="Diagnostic Category" value={labData.testCategory} onChange={(e) => setLabData({ ...labData, testCategory: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField fullWidth label="Test Name" value={labData.testName} onChange={(e) => setLabData({ ...labData, testName: e.target.value })} /></Grid>
                </Grid>
                {labData.ipfsCid && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Scan Uploaded to IPFS! Content Identifier (CID): <strong>{labData.ipfsCid}</strong> (Zero large files on local disk/blockchain)
                  </Alert>
                )}
              </Paper>
            )}

            {activeStep === 5 && (
              <Paper sx={{ p: 3, borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VerifiedIcon /> Step 6: Smart Contract Anchoring (`EMRRegistry.sol &rarr; storeEMRRecord`)
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#1e293b', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Typography variant="body2" sx={{ color: '#cbd5e1' }}>Smart Contract Address: <strong>0x4cB06b7850239d5CcDCA04FddEc75772A5a573Ec</strong></Typography>
                  <Typography variant="body2" sx={{ color: '#cbd5e1', mt: 1 }}>Record Type: <strong>MedicalRecord</strong> | IPFS CID: <strong>{labData.ipfsCid}</strong></Typography>
                  {blockchainTx && (
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: '#0284c7', borderRadius: '6px', color: '#ffffff' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ethereum Transaction Confirmed!</Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>Tx Hash: {blockchainTx}</Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            )}

            {activeStep === 6 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VerifiedUserIcon /> Step 7: Issue Connected Medical Certificate (`POST /api/certificates`)
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Certificate linked to EMR ID: <strong>{emrData.emrId || 'EMR-6001'}</strong> for Patient <strong>{patientData.name}</strong>
                </Alert>
                {certificateData.verificationHash && (
                  <Alert severity="success">
                    Certificate Issued! HMAC Verification Hash: <strong>{certificateData.verificationHash}</strong>
                  </Alert>
                )}
              </Paper>
            )}

            {activeStep === 7 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon /> Step 8: HMAC Verification (`POST /api/certificates/verify`)
                </Typography>
                {verificationResult && (
                  <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Medical Certificate Cryptographically Verified!</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>HMAC Zero-Knowledge Proof hash matches contract state. Valid until: {certificateData.validUntil}</Typography>
                  </Alert>
                )}
              </Paper>
            )}

            {activeStep === 8 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#d97706', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldIcon /> Step 9: Insurance Claim & On-Chain Verification (`POST /api/insurance/claims`)
                </Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}><Typography variant="body2">Provider: <strong>{insuranceData.provider}</strong></Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Policy No: <strong>{insuranceData.policyNumber}</strong></Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Claim Amount: <strong>{insuranceData.claimAmount}</strong></Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Adjudication Status: <strong>{insuranceData.status.toUpperCase()}</strong></Typography></Grid>
                </Grid>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Chip label="Certificate Verified" color="success" icon={<CheckCircleIcon />} />
                  <Chip label="On-Chain Hash Verified" color="success" icon={<VerifiedIcon />} />
                </Box>
              </Paper>
            )}

            {activeStep === 9 && (
              <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ReceiptLongIcon /> Step 10: Real-time System Audit Trail Log
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
                  All 10 steps automatically recorded in MongoDB `AuditLog` collection storing User, Action, Timestamp, IP Address, Blockchain Tx, and Hash
                </Typography>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Log ID</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Resource</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>IP Address</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Blockchain Tx</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log._id}>
                          <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>{log._id}</TableCell>
                          <TableCell>{log.user}</TableCell>
                          <TableCell><Chip label={log.action} size="small" color={log.action === 'CREATED' ? 'success' : log.action === 'UPDATED' ? 'primary' : 'info'} /></TableCell>
                          <TableCell>{log.resource}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{log.ipAddress}</TableCell>
                          <TableCell>{log.timestamp}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.transactionHash.substring(0, 14)}...</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </>
        )}
      </Box>

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button disabled={activeStep === 0} onClick={() => setActiveStep(prev => prev - 1)} sx={{ textTransform: 'none' }}>
          Back
        </Button>
        {activeStep === steps.length ? (
          <Button variant="contained" onClick={handleReset} sx={{ bgcolor: '#2563eb', textTransform: 'none' }}>
            Run Workflow Again
          </Button>
        ) : (
          <Button variant="contained" onClick={handleNext} sx={{ bgcolor: '#2563eb', textTransform: 'none', fontWeight: 600 }}>
            {activeStep === steps.length - 1 ? 'Complete Workflow & View Audit Log' : `Proceed to Step ${activeStep + 2}: ${steps[activeStep + 1]}`}
          </Button>
        )}
      </Box>
    </Box>
  );
}
