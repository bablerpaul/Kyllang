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
  const [createEmrOpen, setCreateEmrOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [verifying, setVerifying] = useState({});
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [certToRevoke, setCertToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

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

  const handleRequestAccess = (document) => {
    setSelectedDocument(document);
    setRequestFormOpen(true);
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
  const displayDob = patientProfile?.dateOfBirth ? new Date(patientProfile.dateOfBirth).toLocaleDateString() : 'Not provided';
  const displayGender = patientProfile?.gender || 'Not provided';
  const displayBloodGroup = patientProfile?.bloodGroup || 'Not provided';
  const contactPhone = patientProfile?.contactNumber || 'Not provided';
  const contactEmail = patient.email || 'Not provided';
  const contactAddress = patientProfile?.address || 'Not provided';
  
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
        <Button 
            variant="contained" 
            color="secondary" 
            startIcon={<AssignmentIcon />} 
            onClick={() => setIssueCertificateOpen(true)}
            sx={{ borderRadius: 2, textTransform: 'none', ml: 'auto' }}
        >
            Issue Medical Certificate
        </Button>
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
                                        <Button variant="outlined" size="small" onClick={() => window.open(doc.fileUrl, '_blank')}>View</Button>
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
                                        primary="Protected Document" 
                                        secondary="Request access to view metadata and contents" 
                                    />
                                    <ListItemSecondaryAction>
                                        <Button variant="contained" size="small" onClick={() => handleRequestAccess(doc)}>Request Access</Button>
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
                                {cert.status === 'revoked' && (
                                    <Box sx={{ position: 'absolute', top: 10, right: 10 }}>
                                        <Chip label="REVOKED" color="error" size="small" />
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
                                    {cert.status !== 'revoked' && new Date(cert.validUntil) >= new Date() && (
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
                                    {cert.status === 'revoked' && (
                                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>
                                            Revoked on {new Date(cert.revokedAt).toLocaleDateString()}
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
      {requestFormOpen && selectedDocument && (
        <RequestForm
          open={requestFormOpen}
          onClose={() => setRequestFormOpen(false)}
          documentId={selectedDocument._id}
          patientId={id}
          onSuccess={() => {
            setRequestFormOpen(false);
            fetchAllData();
          }}
        />
      )}

      {createEmrOpen && selectedAppointment && (
        <CreateEMRDialog
          open={createEmrOpen}
          onClose={() => setCreateEmrOpen(false)}
          patientId={id}
          appointmentId={selectedAppointment._id}
          onSuccess={() => {
            setCreateEmrOpen(false);
            fetchAllData();
            setActiveTab(2); // Jump to clinical history after creating EMR
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
          patient={patientProfile || patient}
          appointment={selectedAppointment}
        />
      )}

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