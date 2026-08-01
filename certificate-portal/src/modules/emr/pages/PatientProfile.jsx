import { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    TextField,
    Button,
    Chip,
    Divider,
    Paper,
    Alert,
    Tab,
    Tabs,
    CircularProgress,
    MenuItem,
} from '@mui/material';
import {
    Person,
    Edit,
    Save,
    History,
    LocalHospital,
    Medication,
    Science,
    VerifiedUser,
    Phone,
    ContactEmergency,
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const PatientProfile = () => {
    const [tab, setTab] = useState(0);
    const [profile, setProfile] = useState(null);
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [editMode, setEditMode] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        dateOfBirth: '',
        gender: 'Prefer not to say',
        contactNumber: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        emergencyName: '',
        emergencyPhone: '',
        emergencyRelation: '',
        bloodGroup: 'Unknown',
        allergies: '',
        chronicConditions: '',
    });

    const fetchProfile = async () => {
        try {
            const data = await apiFetch('/api/patient/profile');
            setProfile(data);
            setFormData({
                name: data.user?.name || '',
                dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
                gender: data.gender || 'Prefer not to say',
                contactNumber: data.contactNumber || '',
                addressStreet: data.address?.street || '',
                addressCity: data.address?.city || '',
                addressState: data.address?.state || '',
                addressZip: data.address?.zipCode || '',
                emergencyName: data.emergencyContact?.name || '',
                emergencyPhone: data.emergencyContact?.phone || '',
                emergencyRelation: data.emergencyContact?.relationship || '',
                bloodGroup: data.bloodGroup || 'Unknown',
                allergies: (data.allergies || []).join(', '),
                chronicConditions: (data.chronicConditions || []).join(', '),
            });
        } catch (err) {
            console.error('Error fetching profile:', err);
        }
    };

    const fetchHistory = async () => {
        try {
            const data = await apiFetch('/api/patient/history');
            setHistory(data);
        } catch (err) {
            console.error('Error fetching medical history:', err);
        }
    };

    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            await Promise.all([fetchProfile(), fetchHistory()]);
            setLoading(false);
        };
        loadAll();
    }, []);

    const handleChange = (field) => (e) => {
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const payload = {
                name: formData.name,
                dateOfBirth: formData.dateOfBirth,
                gender: formData.gender,
                contactNumber: formData.contactNumber,
                address: {
                    street: formData.addressStreet,
                    city: formData.addressCity,
                    state: formData.addressState,
                    zipCode: formData.addressZip,
                },
                emergencyContact: {
                    name: formData.emergencyName,
                    phone: formData.emergencyPhone,
                    relationship: formData.emergencyRelation,
                },
                bloodGroup: formData.bloodGroup,
                allergies: formData.allergies.split(',').map((s) => s.trim()).filter(Boolean),
                chronicConditions: formData.chronicConditions.split(',').map((s) => s.trim()).filter(Boolean),
            };

            const res = await apiFetch('/api/patient/profile', {
                method: 'PUT',
                body: JSON.stringify(payload),
            });

            setMessage({ severity: 'success', text: '✅ Patient Profile updated successfully!' });
            setEditMode(false);
            fetchProfile();
        } catch (err) {
            setMessage({ severity: 'error', text: `Failed to update profile: ${err.message}` });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Loading Patient Profile...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person color="primary" /> Patient Portal & Health Profile
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Manage your personal medical profile, emergency contacts, and view your complete health history.
                </Typography>
            </Paper>

            {message && (
                <Alert severity={message.severity} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tab} onChange={(e, val) => setTab(val)}>
                    <Tab icon={<Person />} label="My Profile" />
                    <Tab icon={<History />} label="Medical History Timeline" />
                </Tabs>
            </Box>

            {/* TAB 0: Patient Profile Form & Card */}
            {tab === 0 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <Card elevation={2}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', mx: 'auto', mb: 2 }}>
                                    {profile?.user?.name ? profile.user.name.charAt(0).toUpperCase() : 'P'}
                                </Box>
                                <Typography variant="h5">{profile?.user?.name || 'Patient'}</Typography>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    {profile?.user?.email}
                                </Typography>
                                <Chip label="Verified Patient" color="success" size="small" sx={{ mt: 1 }} />

                                <Divider sx={{ my: 2 }} />

                                <Box sx={{ textAlign: 'left' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        <strong>Blood Group:</strong> {profile?.bloodGroup || 'Unknown'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                                        <strong>Contact Phone:</strong> {profile?.contactNumber || 'Not set'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                                        <strong>Assigned Doctors:</strong> {profile?.assignedDoctors?.length || 0}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={8}>
                        <Card elevation={2}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6">Personal & Medical Details</Typography>
                                    <Button
                                        variant={editMode ? 'outlined' : 'contained'}
                                        startIcon={editMode ? <Save /> : <Edit />}
                                        onClick={() => (editMode ? handleSaveProfile({ preventDefault: () => {} }) : setEditMode(true))}
                                        disabled={saving}
                                    >
                                        {editMode ? (saving ? 'Saving...' : 'Save Profile') : 'Edit Profile'}
                                    </Button>
                                </Box>
                                <Divider sx={{ mb: 3 }} />

                                <form onSubmit={handleSaveProfile}>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Full Name"
                                                value={formData.name}
                                                onChange={handleChange('name')}
                                                disabled={!editMode}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                type="date"
                                                label="Date of Birth"
                                                InputLabelProps={{ shrink: true }}
                                                value={formData.dateOfBirth}
                                                onChange={handleChange('dateOfBirth')}
                                                disabled={!editMode}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                select
                                                label="Gender"
                                                value={formData.gender}
                                                onChange={handleChange('gender')}
                                                disabled={!editMode}
                                            >
                                                <MenuItem value="Male">Male</MenuItem>
                                                <MenuItem value="Female">Female</MenuItem>
                                                <MenuItem value="Other">Other</MenuItem>
                                                <MenuItem value="Prefer not to say">Prefer not to say</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                select
                                                label="Blood Group"
                                                value={formData.bloodGroup}
                                                onChange={handleChange('bloodGroup')}
                                                disabled={!editMode}
                                            >
                                                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map((bg) => (
                                                    <MenuItem key={bg} value={bg}>{bg}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Contact Phone"
                                                value={formData.contactNumber}
                                                onChange={handleChange('contactNumber')}
                                                disabled={!editMode}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Street Address"
                                                value={formData.addressStreet}
                                                onChange={handleChange('addressStreet')}
                                                disabled={!editMode}
                                            />
                                        </Grid>

                                        {/* Emergency Contact Header */}
                                        <Grid item xs={12}>
                                            <Typography variant="subtitle1" sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <ContactEmergency color="error" /> Emergency Contact Info
                                            </Typography>
                                            <Divider sx={{ my: 1 }} />
                                        </Grid>

                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Contact Name"
                                                value={formData.emergencyName}
                                                onChange={handleChange('emergencyName')}
                                                disabled={!editMode}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Relationship"
                                                value={formData.emergencyRelation}
                                                onChange={handleChange('emergencyRelation')}
                                                disabled={!editMode}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Phone Number"
                                                value={formData.emergencyPhone}
                                                onChange={handleChange('emergencyPhone')}
                                                disabled={!editMode}
                                            />
                                        </Grid>

                                        {/* Medical Allergies & Conditions */}
                                        <Grid item xs={12}>
                                            <Typography variant="subtitle1" sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <LocalHospital color="primary" /> Allergies & Medical Conditions
                                            </Typography>
                                            <Divider sx={{ my: 1 }} />
                                        </Grid>

                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Known Allergies (comma-separated)"
                                                value={formData.allergies}
                                                onChange={handleChange('allergies')}
                                                disabled={!editMode}
                                                placeholder="Penicillin, Peanuts, Latex"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Chronic Conditions (comma-separated)"
                                                value={formData.chronicConditions}
                                                onChange={handleChange('chronicConditions')}
                                                disabled={!editMode}
                                                placeholder="Hypertension, Asthma, Asthma"
                                            />
                                        </Grid>
                                    </Grid>

                                    {editMode && (
                                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                                            <Button onClick={() => setEditMode(false)}>Cancel</Button>
                                            <Button type="submit" variant="contained" disabled={saving}>
                                                {saving ? 'Saving...' : 'Save Profile'}
                                            </Button>
                                        </Box>
                                    )}
                                </form>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* TAB 1: Medical History Timeline */}
            {tab === 1 && (
                <Grid container spacing={3}>
                    {/* Medical Records */}
                    <Grid item xs={12} md={6}>
                        <Card elevation={2}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <LocalHospital color="primary" /> Medical Encounters & Diagnoses ({history?.medicalRecords?.length || 0})
                                </Typography>
                                <Divider sx={{ my: 2 }} />

                                {(history?.medicalRecords || []).length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No clinical visit records found.</Typography>
                                ) : (
                                    history.medicalRecords.map((rec) => (
                                        <Paper key={rec._id} variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fafafa' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">{rec.diagnosis || rec.chiefComplaint}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Attending Physician: {rec.doctor?.user?.name ? `Dr. ${rec.doctor.user.name}` : 'Doctor'}
                                            </Typography>
                                            <Typography variant="caption" color="primary" display="block">
                                                Visit Date: {new Date(rec.visitDate || rec.createdAt).toLocaleDateString()}
                                            </Typography>
                                        </Paper>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Prescriptions */}
                    <Grid item xs={12} md={6}>
                        <Card elevation={2}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Medication color="success" /> Prescriptions ({history?.prescriptions?.length || 0})
                                </Typography>
                                <Divider sx={{ my: 2 }} />

                                {(history?.prescriptions || []).length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No prescription records found.</Typography>
                                ) : (
                                    history.prescriptions.map((rx) => (
                                        <Paper key={rx._id} variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#f1f8e9' }}>
                                            <Typography variant="subtitle2" fontWeight="bold">
                                                {(rx.medications || []).map((m) => `${m.name} (${m.dosage})`).join(', ') || 'Prescription'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Issued: {new Date(rx.createdAt).toLocaleDateString()}
                                            </Typography>
                                        </Paper>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Lab Reports */}
                    <Grid item xs={12} md={6}>
                        <Card elevation={2}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Science color="warning" /> Lab Reports ({history?.labReports?.length || 0})
                                </Typography>
                                <Divider sx={{ my: 2 }} />

                                {(history?.labReports || []).length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No lab reports found.</Typography>
                                ) : (
                                    history.labReports.map((lab) => (
                                        <Paper key={lab._id} variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fffde7' }}>
                                            <Typography variant="subtitle2" fontWeight="bold">{lab.testName} ({lab.testCategory})</Typography>
                                            <Typography variant="body2">{lab.resultsSummary}</Typography>
                                        </Paper>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Medical Certificates */}
                    <Grid item xs={12} md={6}>
                        <Card elevation={2}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <VerifiedUser color="info" /> Verified Certificates ({history?.certificates?.length || 0})
                                </Typography>
                                <Divider sx={{ my: 2 }} />

                                {(history?.certificates || []).length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No certificates issued yet.</Typography>
                                ) : (
                                    history.certificates.map((cert) => (
                                        <Paper key={cert._id} variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#e3f2fd' }}>
                                            <Typography variant="subtitle2" fontWeight="bold">{cert.diagnosis}</Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Issued: {new Date(cert.validFrom).toLocaleDateString()} to {new Date(cert.validUntil).toLocaleDateString()}
                                            </Typography>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', mt: 0.5 }}>
                                                Hash: {cert.verificationHash}
                                            </Typography>
                                        </Paper>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default PatientProfile;
