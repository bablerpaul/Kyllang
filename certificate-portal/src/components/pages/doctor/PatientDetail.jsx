import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, Button, List, ListItem, ListItemText,
  ListItemSecondaryAction, Chip, Divider, Alert, Paper, Avatar, IconButton, Tooltip,
    Tab, Tabs, Skeleton, ListItemIcon,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, Assignment as AssignmentIcon, MedicalServices as MedicalServicesIcon,
  History as HistoryIcon, ContactPhone as ContactPhoneIcon, Bloodtype as BloodtypeIcon,
  CalendarToday as CalendarIcon, AccessTime as AccessTimeIcon, Description as DescriptionIcon,
    Lock as LockIcon, CheckCircle as CheckCircleIcon,
  WarningAmber as WarningAmberIcon, Healing as HealingIcon, Refresh as RefreshIcon,
  Email as EmailIcon, Phone as PhoneIcon, Home as HomeIcon, Cake as CakeIcon, Wc as WcIcon,
  Person as PersonIcon, VerifiedUser as VerifiedUserIcon
} from '@mui/icons-material';

import RequestForm from './RequestForm';
import CreateEMRDialog from './CreateEMRDialog';
import IssueCertificateForm from './IssueCertificateForm';
import { apiFetch } from '../../../utils/api';

// Status precedence: revoked > expired > active. Expiry is derived from validUntil, never persisted.
const getCertStatus = (cert) => {
  if (cert?.status === 'revoked') return 'revoked';
  if (cert?.validUntil && new Date(cert.validUntil) < new Date()) return 'expired';
  return 'active';
};

// "Request Certificate" = request access to an EXISTING certificate (CertificateAccessRequest).
// Creating a NEW certificate is "Issue Certificate". Server messages are never shown verbatim.
const CERT_ACCESS_REQUEST_ERRORS = {
  401: 'Your session has expired. Please sign in again.',
  403: 'You are not authorized to request access to this certificate.',
  404: 'Certificate not found.',
  409: 'An access request for this certificate is already pending.',
};
const CERT_STATUS_CHIP = { active: 'success', expired: 'warning', revoked: 'error' };

const PatientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Data
  const [patient, setPatient] = useState(null); // From list endpoint
  const [patientProfile, setPatientProfile] = useState(null); // Real Patient document
  const [appointments, setAppointments] = useState([]);
  const [emrs, setEmrs] = useState([]);
  const [certificates, setCertificates] = useState([]);
  
  // Documents
  const [documents, setDocuments] = useState([]);
  const [grantedDocuments, setGrantedDocuments] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState(0);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [issueCertificateOpen, setIssueCertificateOpen] = useState(false);
  const [requestCertificateDialogOpen, setRequestCertificateDialogOpen] = useState(false);
  const [requestingCertId, setRequestingCertId] = useState(null);
  const [certRequestFeedback, setCertRequestFeedback] = useState(null); // { severity, text }
  const [pendingCertIds, setPendingCertIds] = useState(() => new Set());
  const [createEmrOpen, setCreateEmrOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [verifying, setVerifying] = useState({});
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [certToRevoke, setCertToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [requestDocumentDialogOpen, setRequestDocumentDialogOpen] = useState(false);
  const [requestingDocId, setRequestingDocId] = useState(null);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Fetch Patient List to get user info (verifies doctor authorization)
    const patientsResponse = await apiFetch('/api/doctor/patients');
    const patients = Array.isArray(patientsResponse?.data) ? patientsResponse.data : [];
      const foundPatient = patients.find(p => p._id === id);
      if (foundPatient) {
        setPatient(foundPatient);
      } else {
        throw new Error("Patient not found or you are not authorized to view this patient.");
      }

            // 2. Fetch Appointments
      try {
        const apptsResponse = await apiFetch(`/api/appointments?patientId=${id}`);
        setAppointments(apptsResponse.data || []);
      } catch (e) {
        console.warn("Could not fetch appointments:", e);
      }

            // 3. Fetch EMRs and the consent-gated patient profile
      try {
        const emrResponse = await apiFetch(`/api/doctor/patient/${id}/emr`);
                if (emrResponse?.data?.patient) {
                    setPatientProfile(emrResponse.data.patient);
                }
        setEmrs(Array.isArray(emrResponse?.data?.medicalRecords) ? emrResponse.data.medicalRecords : []);
                setCertificates(Array.isArray(emrResponse?.data?.certificates) ? emrResponse.data.certificates : []);
      } catch (e) {
        console.warn("Could not fetch EMRs:", e);
      }

            // 4. Fetch Documents
      try {
        const docs = await apiFetch(`/api/doctor/patients/${id}/documents`);
        if (Array.isArray(docs.data)) {
            const available = docs.data.filter(d => !d.hasAccess);
            const granted = docs.data.filter(d => d.hasAccess);
            setDocuments(available);
            setGrantedDocuments(granted);
        }
      } catch (e) {
        console.warn("Could not fetch documents:", e);
      }

    } catch (err) {
      console.error('Failed to fetch patient data:', err);
      setError(err.message || "Failed to load patient details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Informational only: marks certificates that already have a pending access request from this doctor.
  // The backend stays the source of truth (a duplicate POST is refused with 409).
  const loadPendingCertificateRequests = useCallback(async () => {
    try {
      const res = await apiFetch('/api/doctor/certificate-access-requests?status=pending', { redirectOnAuthFailure: false });
      const rows = Array.isArray(res?.data) ? res.data : [];
      setPendingCertIds(new Set(rows.map((r) => String(r.certificate?.certificateId)).filter(Boolean)));
    } catch (_) {
      // Keep whatever is already known; never block requesting on this lookup.
    }
  }, []);

  const openRequestCertificateDialog = () => {
    setCertRequestFeedback(null);
    setRequestCertificateDialogOpen(true);
    loadPendingCertificateRequests();
  };

  const handleRequestCertificateAccess = async (cert) => {
    if (!cert?._id || requestingCertId) return;
    const certId = String(cert._id);
    setRequestingCertId(certId);
    setCertRequestFeedback(null);
    try {
      // The certificate id goes in the URL only; the backend derives doctor and patient itself.
      await apiFetch(`/api/doctor/certificates/${encodeURIComponent(certId)}/request`, { method: 'POST' });
      setCertRequestFeedback({ severity: 'success', text: 'Certificate access request sent.' });
      await loadPendingCertificateRequests();
      setPendingCertIds((prev) => new Set(prev).add(certId));
    } catch (err) {
      console.error('Certificate access request failed:', err?.status);
      if (err?.status === 409) setPendingCertIds((prev) => new Set(prev).add(certId));
      setCertRequestFeedback({
        severity: err?.status === 409 ? 'warning' : 'error',
        text: CERT_ACCESS_REQUEST_ERRORS[err?.status] || 'Failed to send the certificate access request. Please try again.',
      });
    } finally {
      setRequestingCertId(null);
    }
  };

  const handleRequestDocumentAccess = async (doc) => {
    try {
        setRequestingDocId(doc._id);
        await apiFetch(`/api/doctor/documents/${doc._id}/request`, {
            method: 'POST'
        });
        alert('Access request submitted successfully.');
        setRequestDocumentDialogOpen(false);
        fetchAllData();
    } catch (error) {
        if (error.status === 400) {
            alert('A request for this document is already pending.');
        } else if (error.status === 403) {
            alert('Active patient consent is required to request document access.');
        } else if (error.status === 404) {
            alert('Document could not be found.');
        } else {
            alert(error.message || 'Failed to request document access.');
        }
    } finally {
        setRequestingDocId(null);
    }
  };

  const handleVerifyIntegrity = async (emrId) => {
    try {
      setVerifying({ ...verifying, [emrId]: true });
      const res = await apiFetch(`/api/emr/${emrId}/verify`);
      alert(`Integrity verification passed.\n\nMessage: ${res.message || 'Verified successfully'}`);
    } catch (err) {
      alert("Verification failed: " + err.message);
    } finally {
      setVerifying({ ...verifying, [emrId]: false });
    }
  };

  const handleRevokeSubmit = async () => {
    if (!certToRevoke) return;
    try {
        setRevoking(true);
        await apiFetch(`/api/certificates/${certToRevoke._id}/revoke`, {
            method: 'PUT',
            body: JSON.stringify({ reason: revokeReason })
        });
        alert('Medical certificate revoked successfully.');
        setRevokeDialogOpen(false);
        setCertToRevoke(null);
        setRevokeReason('');
        fetchAllData();
    } catch (err) {
        alert("Failed to revoke certificate: " + err.message);
    } finally {
        setRevoking(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Skeleton variant="rectangular" width={100} height={36} sx={{ mr: 2 }} />
            <Skeleton variant="text" width={200} height={40} />
        </Box>
        <Paper sx={{ mb: 3 }}>
            <Tabs value={0}>
                <Tab label={<Skeleton variant="text" width={80} />} />
                <Tab label={<Skeleton variant="text" width={80} />} />
            </Tabs>
        </Paper>
        <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={300} />
            </Grid>
            <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={300} />
            </Grid>
        </Grid>
      </Box>
    );
  }

  if (error || !patient) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard/my-patients')} sx={{ mb: 2 }}>
          Back to My Patients
        </Button>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={fetchAllData}>Retry</Button>}>
            {error || "Patient not found."}
        </Alert>
      </Box>
    );
  }

  // Helpers
  // Patient.address is a nested object ({street, city, state, zipCode}), never a plain string from
  // the current backend — but this stays defensive of a string value too (legacy data) and must
  // NEVER hand a raw object to JSX, which throws "Objects are not valid as a React child".
  const formatAddress = (address) => {
    if (!address) return 'Not provided';
    if (typeof address === 'string') return address.trim() || 'Not provided';
    const parts = [address.street, address.city, address.state, address.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Not provided';
  };

  const displayDob = patientProfile?.dateOfBirth ? new Date(patientProfile.dateOfBirth).toLocaleDateString() : 'Not provided';
  const displayGender = patientProfile?.gender || 'Not provided';
  const displayBloodGroup = patientProfile?.bloodGroup || 'Not provided';
  const contactPhone = patientProfile?.contactNumber || 'Not provided';
  const contactEmail = patient.email || 'Not provided';
  const contactAddress = formatAddress(patientProfile?.address);
  
  const upcomingAppointments = appointments.filter(a => ['scheduled', 'rescheduled'].includes(a.status)).sort((a,b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
  const pastAppointments = appointments.filter(a => !['scheduled', 'rescheduled'].includes(a.status)).sort((a,b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));
  
  const nextAppointment = upcomingAppointments.length > 0 ? upcomingAppointments[0] : null;
  const recentEMR = emrs.length > 0 ? [...emrs].sort((a,b) => new Date(b.visitDate) - new Date(a.visitDate))[0] : null;

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard/my-patients')} variant="outlined">
          Back to My Patients
        </Button>
        <Typography variant="h4" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
              {patient.name?.charAt(0)?.toUpperCase()}
          </Avatar>
          {patient.name}
        </Typography>
        <Tooltip title="Refresh Data">
            <IconButton onClick={fetchAllData} color="primary">
                <RefreshIcon />
            </IconButton>
        </Tooltip>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
            <Button 
                variant="outlined" 
                color="info" 
                startIcon={<DescriptionIcon />} 
                onClick={() => setRequestDocumentDialogOpen(true)}
                sx={{ borderRadius: 2, textTransform: 'none' }}
            >
                Request Document
            </Button>
            <Tooltip title="Request access to an EXISTING certificate of this patient" describeChild>
                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<AssignmentIcon />}
                    onClick={openRequestCertificateDialog}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                    Request Certificate
                </Button>
            </Tooltip>
            <Tooltip title="Create a NEW certificate for this patient" describeChild>
                <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<MedicalServicesIcon />}
                    onClick={() => setIssueCertificateOpen(true)}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                    Issue Certificate
                </Button>
            </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
            value={activeTab} 
            onChange={(e, newValue) => setActiveTab(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Overview" icon={<PersonIcon />} iconPosition="start" />
          <Tab label="Appointments" icon={<CalendarIcon />} iconPosition="start" />
          <Tab label="Clinical History" icon={<HistoryIcon />} iconPosition="start" />
          <Tab label="Documents" icon={<DescriptionIcon />} iconPosition="start" />
          <Tab label="Certificates" icon={<MedicalServicesIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* TAB 0: OVERVIEW */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
            {/* Left Column: Personal & Contact */}
            <Grid item xs={12} md={4}>
                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="primary">Personal Information</Typography>
                        <List dense disablePadding>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><WcIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Gender" secondary={displayGender} />
                            </ListItem>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><CakeIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="DOB" secondary={displayDob} />
                            </ListItem>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><AssignmentIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Patient ID" secondary={patient._id} />
                            </ListItem>
                        </List>
                    </CardContent>
                </Card>

                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="primary">Contact</Typography>
                        <List dense disablePadding>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><PhoneIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Phone" secondary={contactPhone} />
                            </ListItem>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><EmailIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Email" secondary={contactEmail} />
                            </ListItem>
                            <ListItem disablePadding sx={{ mb: 1 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><HomeIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Address" secondary={contactAddress} />
                            </ListItem>
                        </List>
                    </CardContent>
                </Card>
            </Grid>

            {/* Middle Column: Medical & Emergency */}
            <Grid item xs={12} md={4}>
                <Card elevation={2} sx={{ mb: 3, height: '100%' }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="primary">Medical Profile</Typography>
                        <List dense disablePadding>
                            <ListItem disablePadding sx={{ mb: 2 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><BloodtypeIcon color="error" fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Blood Group" secondary={displayBloodGroup} />
                            </ListItem>
                        </List>

                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <WarningAmberIcon fontSize="small" color="error" /> Allergies
                        </Typography>
                        {patientProfile?.allergies && patientProfile.allergies.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {patientProfile.allergies.map((allergy, i) => (
                                    <Chip key={i} label={allergy} size="small" color="error" variant="outlined" />
                                ))}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No known allergies recorded</Typography>
                        )}

                        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <HealingIcon fontSize="small" color="info" /> Chronic Conditions
                        </Typography>
                        {patientProfile?.chronicConditions && patientProfile.chronicConditions.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {patientProfile.chronicConditions.map((cond, i) => (
                                    <Chip key={i} label={cond} size="small" color="info" variant="outlined" />
                                ))}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No chronic conditions recorded</Typography>
                        )}
                        
                        <Divider sx={{ my: 3 }} />

                        <Typography variant="h6" gutterBottom color="primary">Emergency Contact</Typography>
                        {patientProfile?.emergencyContact ? (
                            <List dense disablePadding>
                                <ListItem disablePadding sx={{ mb: 1 }}>
                                    <ListItemIcon sx={{ minWidth: 36 }}><ContactPhoneIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText 
                                        primary={patientProfile.emergencyContact.name || "Name not provided"} 
                                        secondary={`${patientProfile.emergencyContact.relationship || 'Relationship not provided'} • ${patientProfile.emergencyContact.phone || 'Phone not provided'}`} 
                                    />
                                </ListItem>
                            </List>
                        ) : (
                            <Typography variant="body2" color="text.secondary">Not provided</Typography>
                        )}
                    </CardContent>
                </Card>
            </Grid>

            {/* Right Column: Summaries */}
            <Grid item xs={12} md={4}>
                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="primary">Next Appointment</Typography>
                        {nextAppointment ? (
                            <Box>
                                <Typography variant="subtitle1" fontWeight="bold">
                                    {new Date(nextAppointment.appointmentDate).toLocaleDateString()} at {nextAppointment.timeSlot}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Reason: {nextAppointment.reason || 'Not specified'}
                                </Typography>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    sx={{ mt: 2 }}
                                    onClick={() => setActiveTab(1)}
                                >
                                    View Appointments
                                </Button>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No upcoming appointments</Typography>
                        )}
                    </CardContent>
                </Card>

                <Card elevation={2}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="primary">Recent Encounter</Typography>
                        {recentEMR ? (
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    {new Date(recentEMR.visitDate).toLocaleDateString()}
                                </Typography>
                                <Typography variant="body1" sx={{ mt: 1, fontWeight: 'medium' }}>
                                    {recentEMR.diagnosis || 'Diagnosis not specified'}
                                </Typography>
                                {recentEMR.vitals && Object.keys(recentEMR.vitals).length > 0 && (
                                    <Box sx={{ mt: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                                        <Typography variant="caption" display="block" gutterBottom fontWeight="bold">Vitals:</Typography>
                                        <Grid container spacing={1}>
                                            {recentEMR.vitals.bloodPressure && (
                                                <Grid item xs={6}><Typography variant="caption">BP: {recentEMR.vitals.bloodPressure}</Typography></Grid>
                                            )}
                                            {recentEMR.vitals.heartRate && (
                                                <Grid item xs={6}><Typography variant="caption">HR: {recentEMR.vitals.heartRate}</Typography></Grid>
                                            )}
                                            {recentEMR.vitals.temperature && (
                                                <Grid item xs={6}><Typography variant="caption">Temp: {recentEMR.vitals.temperature}</Typography></Grid>
                                            )}
                                        </Grid>
                                    </Box>
                                )}
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    sx={{ mt: 2 }}
                                    onClick={() => setActiveTab(2)}
                                >
                                    View Clinical History
                                </Button>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No clinical information available.</Typography>
                        )}
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
      )}

      {/* TAB 1: APPOINTMENTS */}
      {activeTab === 1 && (
        <Box>
            <Typography variant="h6" gutterBottom>Upcoming Appointments</Typography>
            {upcomingAppointments.length === 0 ? (
                <Alert severity="info" sx={{ mb: 4 }}>No upcoming appointments found.</Alert>
            ) : (
                <Grid container spacing={2} sx={{ mb: 4 }}>
                    {upcomingAppointments.map((appt) => (
                        <Grid item xs={12} sm={6} md={4} key={appt._id}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        {new Date(appt.appointmentDate).toLocaleDateString()}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <AccessTimeIcon fontSize="small" /> {appt.timeSlot}
                                    </Typography>
                                    <Chip label={appt.status.toUpperCase()} size="small" color="primary" sx={{ mb: 1 }} />
                                    <Typography variant="body2">Reason: {appt.reason || 'N/A'}</Typography>
                                    
                                    <Button 
                                        variant="contained" 
                                        color="primary" 
                                        size="small" 
                                        fullWidth 
                                        sx={{ mt: 2 }}
                                        onClick={() => {
                                            setSelectedAppointment(appt);
                                            setCreateEmrOpen(true);
                                        }}
                                    >
                                        Start Consultation
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Typography variant="h6" gutterBottom>Appointment History</Typography>
            {pastAppointments.length === 0 ? (
                <Alert severity="info">No past appointments found.</Alert>
            ) : (
                <List sx={{ bgcolor: 'background.paper' }}>
                    {pastAppointments.map((appt, idx) => (
                        <React.Fragment key={appt._id}>
                            <ListItem alignItems="flex-start">
                                <ListItemText 
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {new Date(appt.appointmentDate).toLocaleDateString()} at {appt.timeSlot}
                                            <Chip 
                                                label={appt.status.toUpperCase()} 
                                                size="small" 
                                                color={appt.status === 'completed' ? 'success' : appt.status === 'cancelled' ? 'error' : 'default'} 
                                            />
                                        </Box>
                                    }
                                    secondary={
                                        <React.Fragment>
                                            <Typography component="span" variant="body2" color="text.primary">
                                                Reason: {appt.reason || 'N/A'}
                                            </Typography>
                                        </React.Fragment>
                                    }
                                />
                            </ListItem>
                            {idx < pastAppointments.length - 1 && <Divider />}
                        </React.Fragment>
                    ))}
                </List>
            )}
        </Box>
      )}

      {/* TAB 2: CLINICAL HISTORY */}
      {activeTab === 2 && (
        <Box>
            {emrs.length === 0 ? (
                <Alert severity="info">No clinical encounters recorded.</Alert>
            ) : (
                emrs.map((emr) => (
                    <Card key={emr._id} sx={{ mb: 3 }} elevation={2}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                                <Box>
                                    <Typography variant="h6" color="primary">
                                        Encounter: {new Date(emr.visitDate).toLocaleDateString()}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        EMR ID: {emr._id}
                                    </Typography>
                                </Box>
                                
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                                    <VerifiedUserIcon color={emr.dataHash ? "success" : "disabled"} fontSize="small" />
                                    <Typography variant="caption" color="text.secondary">
                                        {emr.dataHash ? "Has Data Hash" : "No Hash Stored"}
                                    </Typography>
                                    <Button 
                                        size="small" 
                                        variant="outlined" 
                                        color="primary"
                                        onClick={() => handleVerifyIntegrity(emr._id)}
                                        disabled={verifying[emr._id]}
                                    >
                                        {verifying[emr._id] ? 'Verifying...' : 'Verify Integrity'}
                                    </Button>
                                </Box>
                            </Box>

                            <Divider sx={{ mb: 2 }} />

                            <Grid container spacing={3}>
                                <Grid item xs={12} md={8}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom>Clinical Information</Typography>
                                    <Typography variant="body1" sx={{ mb: 1 }}><strong>Diagnosis:</strong> {emr.diagnosis || 'Not specified'}</Typography>
                                    <Typography variant="body2" sx={{ mb: 1 }}><strong>Chief Complaint:</strong> {emr.chiefComplaint || 'Not specified'}</Typography>
                                    <Typography variant="body2" sx={{ mb: 1 }}><strong>Symptoms:</strong> {emr.symptoms || 'Not specified'}</Typography>
                                    <Typography variant="body2" sx={{ mb: 1 }}><strong>Treatment Plan:</strong> {emr.treatmentPlan || 'Not specified'}</Typography>
                                    {emr.clinicalNotes && (
                                        <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'grey.50' }}>
                                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">Clinical Notes:</Typography>
                                            <Typography variant="body2">{emr.clinicalNotes}</Typography>
                                        </Paper>
                                    )}
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom>Vitals</Typography>
                                    <List dense disablePadding>
                                        <ListItem disablePadding><ListItemText primary="Blood Pressure" secondary={emr.vitals?.bloodPressure || emr.vitalSigns?.bloodPressure || 'Not recorded'} /></ListItem>
                                        <ListItem disablePadding><ListItemText primary="Heart Rate" secondary={emr.vitals?.heartRate || emr.vitalSigns?.heartRate || 'Not recorded'} /></ListItem>
                                        <ListItem disablePadding><ListItemText primary="Temperature" secondary={emr.vitals?.temperature || emr.vitalSigns?.temperature || 'Not recorded'} /></ListItem>
                                    </List>

                                    <Typography variant="subtitle2" color="primary" sx={{ mt: 2, mb: 1 }}>Medications</Typography>
                                    {emr.medications && emr.medications.length > 0 ? (
                                        <List dense disablePadding>
                                            {emr.medications.map((med, i) => (
                                                <ListItem key={i} disablePadding>
                                                    <ListItemText primary={med.name} secondary={`${med.dosage} • ${med.frequency}`} />
                                                </ListItem>
                                            ))}
                                        </List>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">No medications recorded</Typography>
                                    )}
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                ))
            )}
        </Box>
      )}

      {/* TAB 3: DOCUMENTS */}
      {activeTab === 3 && (
        <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom color="primary">Granted Documents</Typography>
                {grantedDocuments.length === 0 ? (
                    <Alert severity="info">No authorized documents available.</Alert>
                ) : (
                    <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                        {grantedDocuments.map((doc, idx) => (
                            <React.Fragment key={doc._id}>
                                <ListItem>
                                    <ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon>
                                    <ListItemText 
                                        primary={doc.documentName} 
                                        secondary={new Date(doc.uploadedAt).toLocaleDateString()} 
                                    />
                                    <ListItemSecondaryAction>
                                        <Button variant="outlined" size="small" onClick={() => window.open(doc.fileUrl, '_blank', 'noopener,noreferrer')}>View</Button>
                                    </ListItemSecondaryAction>
                                </ListItem>
                                {idx < grantedDocuments.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </Grid>

            <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom color="text.secondary">Available Documents (Requires Consent)</Typography>
                {documents.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No other documents found.</Typography>
                ) : (
                    <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                        {documents.map((doc, idx) => (
                            <React.Fragment key={doc._id}>
                                <ListItem>
                                    <ListItemIcon><LockIcon color="disabled" /></ListItemIcon>
                                    <ListItemText 
                                        primary={doc.title || doc.documentName || 'Unnamed Document'}
                                        secondary={
                                            <>
                                                <Typography variant="body2" component="span" display="block">Type: {doc.type || 'Unknown'}</Typography>
                                                <Typography variant="body2" component="span" display="block">Date: {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown'}</Typography>
                                            </>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        {doc.hasPendingRequest ? (
                                            <Chip label="Pending" size="small" color="warning" />
                                        ) : (
                                            <Button 
                                                variant="contained" 
                                                size="small" 
                                                disabled={requestingDocId === doc._id}
                                                onClick={() => handleRequestDocumentAccess(doc)}
                                            >
                                                {requestingDocId === doc._id ? 'Requesting...' : 'Request Access'}
                                            </Button>
                                        )}
                                    </ListItemSecondaryAction>
                                </ListItem>
                                {idx < documents.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </Grid>
        </Grid>
      )}

      {/* TAB 4: CERTIFICATES */}
      {activeTab === 4 && (
        <Box>
            <Typography variant="h6" gutterBottom color="primary">Issued Certificates</Typography>
            {certificates.length === 0 ? (
                <Alert severity="info">No certificates issued for this patient.</Alert>
            ) : (
                <Grid container spacing={2}>
                    {certificates.map((cert) => (
                        <Grid item xs={12} sm={6} md={4} key={cert._id}>
                            <Card variant="outlined" sx={{ position: 'relative', overflow: 'visible' }}>
                                {getCertStatus(cert) === 'revoked' && (
                                    <Box sx={{ position: 'absolute', top: 10, right: 10 }}>
                                        <Chip label="REVOKED" color="error" size="small" />
                                    </Box>
                                )}
                                {getCertStatus(cert) === 'expired' && (
                                    <Box sx={{ position: 'absolute', top: 10, right: 10 }}>
                                        <Chip label="EXPIRED" color="warning" size="small" />
                                    </Box>
                                )}
                                <CardContent>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        Certificate
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Diagnosis: {cert.diagnosis || 'N/A'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Valid: {new Date(cert.validFrom).toLocaleDateString()} - {new Date(cert.validUntil).toLocaleDateString()}
                                    </Typography>
                                    {getCertStatus(cert) === 'active' && (
                                        <Button
                                            variant="outlined"
                                            color="error"
                                            size="small"
                                            fullWidth
                                            sx={{ mt: 2 }}
                                            onClick={() => {
                                                setCertToRevoke(cert);
                                                setRevokeDialogOpen(true);
                                            }}
                                        >
                                            Revoke Certificate
                                        </Button>
                                    )}
                                    {getCertStatus(cert) === 'revoked' && (
                                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>
                                            Revoked on {new Date(cert.revokedAt).toLocaleDateString()}
                                        </Typography>
                                    )}
                                    {getCertStatus(cert) === 'expired' && (
                                        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#e65100' }}>
                                            Expired on {new Date(cert.validUntil).toLocaleDateString()}
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
      )}

      {/* Dialogs */}
      {/* Request Document Dialog */}
      <Dialog open={requestDocumentDialogOpen} onClose={() => setRequestDocumentDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Request Document Access</DialogTitle>
          <DialogContent dividers>
              {documents.length === 0 ? (
                  <Alert severity="info">No available documents to request.</Alert>
              ) : (
                  <List>
                      {documents.map((doc, idx) => (
                          <React.Fragment key={doc._id}>
                              <ListItem>
                                  <ListItemText
                                      primary={doc.title || doc.documentName || 'Unnamed Document'}
                                      secondary={
                                          <>
                                              <Typography variant="body2" component="span" display="block">Type: {doc.type || 'Unknown'}</Typography>
                                              <Typography variant="body2" component="span" display="block">Date: {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown'}</Typography>
                                          </>
                                      }
                                  />
                                  <ListItemSecondaryAction>
                                      {doc.hasPendingRequest ? (
                                          <Chip label="Pending" size="small" color="warning" />
                                      ) : (
                                          <Button
                                              variant="contained"
                                              size="small"
                                              disabled={requestingDocId === doc._id}
                                              onClick={() => handleRequestDocumentAccess(doc)}
                                          >
                                              {requestingDocId === doc._id ? 'Requesting...' : 'Request'}
                                          </Button>
                                      )}
                                  </ListItemSecondaryAction>
                              </ListItem>
                              {idx < documents.length - 1 && <Divider />}
                          </React.Fragment>
                      ))}
                  </List>
              )}
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setRequestDocumentDialogOpen(false)}>Close</Button>
          </DialogActions>
      </Dialog>

      {createEmrOpen && selectedAppointment && (
        <CreateEMRDialog
          open={createEmrOpen}
          onClose={() => setCreateEmrOpen(false)}
          // CreateEMRDialog expects a real `appointment` object (see the working invocation in
          // AppointmentsManager.jsx) — it reads appointment.patient/_id/reason internally, not
          // separate patientId/appointmentId props.
          appointment={selectedAppointment}
          onCreated={() => {
            fetchAllData();
            setActiveTab(2); // Jump to clinical history after a real successful creation
          }}
        />
      )}

      {issueCertificateOpen && (
        <IssueCertificateForm
          open={issueCertificateOpen}
          onClose={(success) => {
            setIssueCertificateOpen(false);
            if (success) fetchAllData();
          }}
          patient={patientProfile}
          appointment={selectedAppointment}
        />
      )}

      {/* Request Certificate = access to an EXISTING certificate (CertificateAccessRequest) */}
      <Dialog
          open={requestCertificateDialogOpen}
          onClose={() => !requestingCertId && setRequestCertificateDialogOpen(false)}
          maxWidth="sm"
          fullWidth
      >
          <DialogTitle>Request Access to an Existing Certificate</DialogTitle>
          <DialogContent dividers>
              <DialogContentText sx={{ mb: 2 }}>
                  Choose one of {patient.name || 'this patient'}&apos;s existing certificates. The patient decides whether to
                  share it with you. This does not create a new certificate — use <strong>Issue Certificate</strong> for that.
              </DialogContentText>
              {certRequestFeedback && (
                  <Alert severity={certRequestFeedback.severity} sx={{ mb: 2 }} onClose={() => setCertRequestFeedback(null)}>
                      {certRequestFeedback.text}
                  </Alert>
              )}
              {certificates.length === 0 ? (
                  <Alert severity="info">No existing certificates are available for this patient.</Alert>
              ) : (
                  <List>
                      {certificates.map((cert, idx) => {
                          const certId = String(cert._id);
                          const status = getCertStatus(cert);
                          const isPending = pendingCertIds.has(certId);
                          return (
                              <React.Fragment key={certId}>
                                  <ListItem sx={{ pr: 16 }}>
                                      <ListItemText
                                          primary={
                                              <Box component="span" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                  Certificate {certId}
                                              </Box>
                                          }
                                          secondary={
                                              <>
                                                  <Typography variant="body2" component="span" display="block">
                                                      Valid: {cert.validFrom ? new Date(cert.validFrom).toLocaleDateString() : '—'} – {cert.validUntil ? new Date(cert.validUntil).toLocaleDateString() : '—'}
                                                  </Typography>
                                                  <Typography variant="body2" component="span" display="block">
                                                      Issued: {cert.createdAt ? new Date(cert.createdAt).toLocaleDateString() : '—'}
                                                  </Typography>
                                                  {cert.remarks && (
                                                      <Typography variant="body2" component="span" display="block">Remarks: {cert.remarks}</Typography>
                                                  )}
                                                  <Chip
                                                      component="span"
                                                      label={status}
                                                      size="small"
                                                      color={CERT_STATUS_CHIP[status] || 'default'}
                                                      variant="outlined"
                                                      sx={{ mt: 0.5, textTransform: 'capitalize' }}
                                                  />
                                              </>
                                          }
                                      />
                                      <ListItemSecondaryAction>
                                          {isPending ? (
                                              <Chip label="Pending" size="small" color="warning" />
                                          ) : (
                                              <Button
                                                  variant="contained"
                                                  size="small"
                                                  disabled={Boolean(requestingCertId)}
                                                  onClick={() => handleRequestCertificateAccess(cert)}
                                              >
                                                  {requestingCertId === certId ? 'Requesting...' : 'Request Access'}
                                              </Button>
                                          )}
                                      </ListItemSecondaryAction>
                                  </ListItem>
                                  {idx < certificates.length - 1 && <Divider />}
                              </React.Fragment>
                          );
                      })}
                  </List>
              )}
          </DialogContent>
          <DialogActions>
              <Button onClick={() => navigate('/dashboard/my-certificate-access-requests')} disabled={Boolean(requestingCertId)}>
                  My certificate access requests
              </Button>
              <Button onClick={() => setRequestCertificateDialogOpen(false)} disabled={Boolean(requestingCertId)}>Close</Button>
          </DialogActions>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={revokeDialogOpen} onClose={() => !revoking && setRevokeDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Revoke Certificate</DialogTitle>
          <DialogContent dividers>
              <DialogContentText color="error" sx={{ fontWeight: 'bold', mb: 2 }}>
                  Warning: This action will permanently revoke this certificate on the blockchain.
              </DialogContentText>
              {certToRevoke && (
                  <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2"><strong>Patient:</strong> {patient.name}</Typography>
                      <Typography variant="body2"><strong>Diagnosis:</strong> {certToRevoke.diagnosis}</Typography>
                      <Typography variant="body2">
                          <strong>Valid:</strong> {new Date(certToRevoke.validFrom).toLocaleDateString()} - {new Date(certToRevoke.validUntil).toLocaleDateString()}
                      </Typography>
                  </Box>
              )}
              <TextField
                  autoFocus
                  margin="dense"
                  label="Reason for revocation (Optional)"
                  fullWidth
                  variant="outlined"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  disabled={revoking}
              />
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setRevokeDialogOpen(false)} disabled={revoking}>Cancel</Button>
              <Button onClick={handleRevokeSubmit} color="error" variant="contained" disabled={revoking}>
                  {revoking ? 'Revoking...' : 'Revoke Certificate'}
              </Button>
          </DialogActions>
      </Dialog>

    </Box>
  );
};

export default PatientDetail;