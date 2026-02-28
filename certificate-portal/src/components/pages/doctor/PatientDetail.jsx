import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Divider,
  Alert,
  Paper,
  Avatar,
  IconButton,
  Tooltip,
  Tab,
  Tabs
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Assignment as AssignmentIcon,
  MedicalServices as MedicalServicesIcon,
  History as HistoryIcon,
  ContactPhone as ContactIcon,
  Bloodtype as BloodIcon,
  CalendarToday as CalendarIcon,
  AccessTime as AccessTimeIcon,
  Description as DescriptionIcon,
  Visibility as VisibilityIcon,
  Lock as LockIcon
} from '@mui/icons-material';
import RequestForm from './RequestForm';
import IssueCertificateForm from './IssueCertificateForm';
import { apiFetch } from '../../../utils/api';

const PatientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [grantedDocuments, setGrantedDocuments] = useState([]);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [issueCertificateOpen, setIssueCertificateOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  const fetchPatientData = async () => {
    try {
      const patients = await apiFetch('/api/doctor/patients');
      const foundPatient = patients.find(p => p._id === id);
      if (foundPatient) {
        setPatient(foundPatient);
      }

      const docs = await apiFetch(`/api/doctor/patients/${id}/documents`);

      const available = docs.filter(d => !d.hasAccess);
      const granted = docs.filter(d => d.hasAccess);

      setDocuments(available);
      setGrantedDocuments(granted);
    } catch (err) {
      console.error('Failed to fetch patient data:', err);
    }
  };

  useEffect(() => {
    fetchPatientData();
  }, [id]);

  const handleRequestAccess = (document) => {
    setSelectedDocument(document);
    setRequestFormOpen(true);
  };

  const handleViewDocument = (docId) => {
    navigate(`/doctor/document/${docId}`);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  if (!patient) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading patient information...</Typography>
      </Box>
    );
  }

  const getDocumentIcon = (type) => {
    switch (type) {
      case 'vaccine': return <MedicalServicesIcon />;
      case 'lab_report': return <AssignmentIcon />;
      case 'imaging': return <DescriptionIcon />;
      default: return <DescriptionIcon />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'success';
      case 'Inactive': return 'default';
      case 'Critical': return 'error';
      default: return 'info';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/doctor/dashboard')}
          sx={{ mr: 2 }}
        >
          Back to Dashboard
        </Button>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Patient Details
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column: Patient Info */}
        <Grid item xs={12} md={4}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ width: 80, height: 80, mr: 2, bgcolor: 'primary.main' }}>
                  {patient.name.charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="h5">{patient.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Patient ID: {patient._id?.substring?.(18) || 'Unknown'}
                  </Typography>
                  <Chip
                    label="Active"
                    size="small"
                    color="success"
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Email Address"
                    secondary={patient.email || 'N/A'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Role"
                    secondary={patient.role === 'general_user' ? 'Patient' : patient.role}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="System Registration"
                    secondary={patient._id ? 'Verified User' : 'Pending'}
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MedicalServicesIcon fontSize="small" /> Security
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {patient.publicKey ? (
                  <Chip label="Configured keys" size="small" variant="outlined" color="success" />
                ) : (
                  <Typography variant="body2" color="text.secondary">No keys available.</Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card elevation={2} sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<HistoryIcon />}
                sx={{ mb: 1 }}
              >
                View Medical History
              </Button>
              <Button
                variant="contained"
                fullWidth
                startIcon={<AssignmentIcon />}
                onClick={() => setIssueCertificateOpen(true)}
              >
                Issue Certificate
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Documents */}
        <Grid item xs={12} md={8}>
          <Paper elevation={0} sx={{ mb: 3 }}>
            <Tabs value={activeTab} onChange={handleTabChange}>
              <Tab icon={<DescriptionIcon />} label="Available Documents" />
              <Tab icon={<LockIcon />} label="Granted Access" />
            </Tabs>
          </Paper>

          {activeTab === 0 ? (
            <>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionIcon /> Available Documents
              </Typography>

              <Alert severity="info" sx={{ mb: 3 }}>
                Request access to view patient documents. Patients must approve each request.
              </Alert>

              {documents.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    No documents available for this patient.
                  </Typography>
                </Paper>
              ) : (
                <List sx={{ mb: 3 }}>
                  {documents.map((doc) => (
                    <Card key={doc._id} variant="outlined" sx={{ mb: 2 }}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {getDocumentIcon(doc.type)}
                              <Typography variant="subtitle1">{doc.title}</Typography>
                              <Chip label={doc.type} size="small" variant="outlined" />
                            </Box>
                          }
                          secondary={
                            <>
                              <Typography variant="body2" component="div">
                                Uploaded: {new Date(doc.createdAt).toLocaleDateString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Requires patient approval for access
                              </Typography>
                            </>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleRequestAccess(doc)}
                            disabled={doc.hasPendingRequest}
                          >
                            {doc.hasPendingRequest ? 'Requested' : 'Request Access'}
                          </Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                    </Card>
                  ))}
                </List>
              )}

              <Divider sx={{ my: 3 }} />

              {/* Request Statistics */}
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{documents.length}</Typography>
                    <Typography variant="caption">Available</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {documents.filter(d => d.hasPendingRequest).length}
                    </Typography>
                    <Typography variant="caption">Pending</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {grantedDocuments.length}
                    </Typography>
                    <Typography variant="caption">Granted</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </>
          ) : (
            <>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon /> Granted Access
              </Typography>

              {grantedDocuments.length === 0 ? (
                <Alert severity="warning">
                  No documents granted yet. Request access from the Available Documents tab.
                </Alert>
              ) : (
                <List>
                  {grantedDocuments.map((doc) => (
                    <Card key={doc._id} variant="outlined" sx={{ mb: 2 }}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <DescriptionIcon />
                              <Typography variant="subtitle1">{doc.title}</Typography>
                              <Chip
                                label="Read Only"
                                size="small"
                                color="info"
                                variant="outlined"
                              />
                            </Box>
                          }
                          secondary={
                            <>
                              <Typography variant="body2">
                                Uploaded: {new Date(doc.createdAt).toLocaleDateString()} • Expires: {new Date(doc.expiresAt).toLocaleDateString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Access Level: Full Access
                              </Typography>
                            </>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="View Document">
                            <IconButton
                              color="primary"
                              onClick={() => handleViewDocument(doc._id)}
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    </Card>
                  ))}
                </List>
              )}
            </>
          )}
        </Grid>
      </Grid>

      {/* Request Form Modal */}
      <RequestForm
        open={requestFormOpen}
        onClose={(refresh) => {
          setRequestFormOpen(false);
          if (refresh === true) fetchPatientData();
        }}
        patient={patient}
        document={selectedDocument}
      />

      {/* Issue Certificate Form Modal */}
      <IssueCertificateForm
        open={issueCertificateOpen}
        onClose={() => setIssueCertificateOpen(false)}
        patient={patient}
      />
    </Box>
  );
};

export default PatientDetail;