import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Card, CardContent, TextField, InputAdornment,
    List, ListItem, ListItemAvatar, ListItemText, Avatar, Chip, Button, Alert, Paper
} from '@mui/material';
import { Search as SearchIcon, Assignment as AssignmentIcon, People as PeopleIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../utils/api';

const DoctorPatients = () => {
    const navigate = useNavigate();
    const [doctorPatients, setDoctorPatients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPatients, setFilteredPatients] = useState([]);

    useEffect(() => {
        const fetchPatients = async () => {
            try {
                const data = await apiFetch('/api/doctor/patients');
                setDoctorPatients(data);
                setFilteredPatients(data);
            } catch (err) {
                console.error("Failed to fetch doctor patients:", err);
            }
        };
        fetchPatients();
    }, []);

    const handleSearch = (query) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setFilteredPatients(doctorPatients);
            return;
        }
        const filtered = doctorPatients.filter(patient =>
            patient.name.toLowerCase().includes(query.toLowerCase()) ||
            patient.patientId?.toLowerCase().includes(query.toLowerCase()) ||
            patient.conditions?.some(cond => cond.toLowerCase().includes(query.toLowerCase()))
        );
        setFilteredPatients(filtered);
    };

    const handleViewPatient = (patientId) => {
        navigate(`/doctor/patient/${patientId}`);
    };

    const getPatientAvatarColor = (patientId) => {
        const colors = ['primary', 'secondary', 'success', 'warning', 'info'];
        return colors[patientId % colors.length];
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper elevation={0} sx={{ p: 3, mb: 3, backgroundColor: '#f0f7ff', borderRadius: 2 }}>
                <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PeopleIcon /> My Patients
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Manage and review your patient list.
                </Typography>
            </Paper>

            <Card elevation={3}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h6">
                            Patient List ({filteredPatients.length})
                        </Typography>

                        <TextField
                            size="small"
                            placeholder="Search patients..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ width: 300 }}
                        />
                    </Box>

                    {filteredPatients.length === 0 ? (
                        <Alert severity="info">
                            No patients found. Try a different search term.
                        </Alert>
                    ) : (
                        <List>
                            {filteredPatients.map((patient) => (
                                <Card key={patient._id} variant="outlined" sx={{ mb: 2 }}>
                                    <ListItem>
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: `${getPatientAvatarColor(patient._id)}.main` }}>
                                                {patient.name?.charAt(0) || 'P'}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Typography variant="subtitle1">{patient.name}</Typography>
                                                    <Chip label="Active Patient" size="small" color="success" />
                                                    <Chip icon={<AssignmentIcon />} label={patient._id?.substring?.(18) || 'ID'} size="small" variant="outlined" />
                                                </Box>
                                            }
                                            secondary={
                                                <>
                                                    <Typography variant="body2" component="div">
                                                        Email: {patient.email}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                        ID: {patient._id}
                                                    </Typography>
                                                </>
                                            }
                                        />
                                        <Button variant="contained" size="small" onClick={() => handleViewPatient(patient._id)}>
                                            View Details
                                        </Button>
                                    </ListItem>
                                </Card>
                            ))}
                        </List>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default DoctorPatients;
