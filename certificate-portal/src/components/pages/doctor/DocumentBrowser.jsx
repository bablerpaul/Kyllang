import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemAvatar,
    ListItemText,
    Avatar,
    Chip,
    Button,
    Alert,
    CircularProgress,
    Divider,
} from '@mui/material';
import {
    People as PeopleIcon,
    Description as DescriptionIcon,
    ArrowBack as ArrowBackIcon,
    Lock as LockIcon,
    Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

/**
 * DocumentBrowser — "View Documents" (/dashboard/view-documents)
 *
 * A doctor's document access is per-patient (consent-gated), and there is no backend endpoint
 * that lists a doctor's documents across all patients in one call. This reuses the two existing
 * endpoints already used elsewhere (GET /api/doctor/patients, GET /api/doctor/patients/:id/documents)
 * as a two-step picker: choose a patient, then choose one of their documents. Selecting a document
 * you have active access to navigates to /dashboard/document/:docId, which DocumentViewer loads.
 */
const DocumentBrowser = () => {
    const navigate = useNavigate();

    const [patients, setPatients] = useState([]);
    const [patientsLoading, setPatientsLoading] = useState(true);
    const [patientsError, setPatientsError] = useState('');

    const [selectedPatient, setSelectedPatient] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState('');

    const fetchPatients = useCallback(async () => {
        setPatientsLoading(true);
        setPatientsError('');
        try {
            const res = await apiFetch('/api/doctor/patients');
            const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            setPatients(list);
        } catch (err) {
            setPatientsError(err.message || 'Failed to load your patients.');
        } finally {
            setPatientsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    const openPatientDocuments = async (patient) => {
        setSelectedPatient(patient);
        setDocuments([]);
        setDocsError('');
        setDocsLoading(true);
        try {
            const res = await apiFetch(`/api/doctor/patients/${patient._id}/documents`);
            const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            setDocuments(list);
        } catch (err) {
            setDocsError(err.message || 'Failed to load documents for this patient.');
        } finally {
            setDocsLoading(false);
        }
    };

    const backToPatients = () => {
        setSelectedPatient(null);
        setDocuments([]);
        setDocsError('');
    };

    // ── Step 2: documents for the selected patient ──────────────────────────
    if (selectedPatient) {
        return (
            <Box sx={{ p: { xs: 2, md: 3 } }}>
                <Button startIcon={<ArrowBackIcon />} onClick={backToPatients} sx={{ mb: 2 }}>
                    Back to Patients
                </Button>

                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DescriptionIcon color="primary" /> Documents for {selectedPatient.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Documents you currently have active access to can be opened directly. Locked documents
                        require a request from that patient's detail page.
                    </Typography>
                </Paper>

                {docsLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
                        <CircularProgress size={22} />
                        <Typography>Loading documents...</Typography>
                    </Box>
                ) : docsError ? (
                    <Alert severity="error" action={
                        <Button color="inherit" size="small" onClick={() => openPatientDocuments(selectedPatient)}>Retry</Button>
                    }>
                        {docsError}
                    </Alert>
                ) : documents.length === 0 ? (
                    <Alert severity="info">No documents found for this patient.</Alert>
                ) : (
                    <Paper>
                        <List disablePadding>
                            {documents.map((doc, idx) => (
                                <Box key={doc._id}>
                                    {idx > 0 && <Divider />}
                                    <ListItem
                                        secondaryAction={
                                            doc.hasAccess ? (
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    startIcon={<VisibilityIcon />}
                                                    onClick={() => navigate(`/dashboard/document/${doc._id}`)}
                                                >
                                                    View
                                                </Button>
                                            ) : (
                                                <Chip
                                                    icon={<LockIcon />}
                                                    label={doc.hasPendingRequest ? 'Request Pending' : 'Access Required'}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            )
                                        }
                                    >
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: doc.hasAccess ? 'primary.main' : 'grey.400' }}>
                                                <DescriptionIcon />
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={doc.title}
                                            secondary={`${doc.type || 'Document'} · Uploaded ${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown'}`}
                                        />
                                    </ListItem>
                                </Box>
                            ))}
                        </List>
                    </Paper>
                )}

                {documents.some((d) => !d.hasAccess) && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        To request access to a locked document, open{' '}
                        <Button size="small" onClick={() => navigate(`/dashboard/patient/${selectedPatient._id}`)}>
                            {selectedPatient.name}'s Patient Detail page
                        </Button>.
                    </Alert>
                )}
            </Box>
        );
    }

    // ── Step 1: pick a patient ───────────────────────────────────────────────
    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PeopleIcon color="primary" /> View Documents
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Select a patient to view the documents available to you.
                </Typography>
            </Paper>

            {patientsLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
                    <CircularProgress size={22} />
                    <Typography>Loading your patients...</Typography>
                </Box>
            ) : patientsError ? (
                <Alert severity="error" action={
                    <Button color="inherit" size="small" onClick={fetchPatients}>Retry</Button>
                }>
                    {patientsError}
                </Alert>
            ) : patients.length === 0 ? (
                <Alert severity="info">No patients are currently assigned or authorized for your account.</Alert>
            ) : (
                <Paper>
                    <List disablePadding>
                        {patients.map((patient, idx) => (
                            <Box key={patient._id}>
                                {idx > 0 && <Divider />}
                                <ListItem disablePadding>
                                    <ListItemButton onClick={() => openPatientDocuments(patient)}>
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: 'primary.main' }}>
                                                {patient.name?.charAt(0)?.toUpperCase() || 'P'}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText primary={patient.name} secondary={patient.email} />
                                    </ListItemButton>
                                </ListItem>
                            </Box>
                        ))}
                    </List>
                </Paper>
            )}
        </Box>
    );
};

export default DocumentBrowser;
