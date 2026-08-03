import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    TextField, MenuItem, Button, TablePagination, Divider
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LinkIcon from '@mui/icons-material/Link';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import StorageIcon from '@mui/icons-material/Storage';

import SecureUploadForm from '../../components/secure-storage/SecureUploadForm';
import SecureVerifyForm from '../../components/secure-storage/SecureVerifyForm';

const SecureStorageDashboard = () => {
    const [stats, setStats] = useState(null);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Pagination & Search & Filter
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalFiles, setTotalFiles] = useState(0);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('All');

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/secure-storage/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch storage statistics');
            const dataRes = await res.json();
            setStats(dataRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const query = new URLSearchParams({
                page: page + 1,
                limit: rowsPerPage,
                search: search,
                documentType: filterType
            }).toString();

            const res = await fetch(`/api/secure-storage/?${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch secure files');
            const dataRes = await res.json();
            const data = dataRes.data;
            setFiles(data.files || []);
            setTotalFiles(data.total || 0);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        fetchFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rowsPerPage, search, filterType]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(0);
    };

    const handleFilterChange = (e) => {
        setFilterType(e.target.value);
        setPage(0);
    };

    const handleDownload = (id) => {
        const token = localStorage.getItem('token');
        fetch(`/api/secure-storage/download/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
            if (!res.ok) throw new Error('Download failed');
            return res.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `secure_file_${id}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => alert(err.message));
    };

    return (
        <Box sx={{ pb: 4 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                Secure Storage Dashboard
            </Typography>

            {/* Status Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: '#e0f2fe', border: '1px solid #bae6fd' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <StorageIcon sx={{ fontSize: 40, color: '#0284c7', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#0369a1' }}>
                                {stats ? stats.totalFiles : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#0c4a6e', fontWeight: 500 }}>
                                Total Files Stored
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#0c4a6e' }}>
                                Approx {stats?.encryptedSizeApproximation || '0 MB'} Encrypted
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <LockIcon sx={{ fontSize: 40, color: '#16a34a', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#15803d' }}>
                                100%
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#14532d', fontWeight: 500 }}>
                                AES-256 Encrypted
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#14532d' }}>
                                Zero-Knowledge Protected
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: '#fdf4ff', border: '1px solid #fbcfe8' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <LinkIcon sx={{ fontSize: 40, color: '#c026d3', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#a21caf' }}>
                                {stats ? stats.anchoredCount : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#701a75', fontWeight: 500 }}>
                                Blockchain Anchored
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#701a75' }}>
                                Immutable SHA-256 Hashes
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: '#fef3c7', border: '1px solid #fde68a' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <CloudQueueIcon sx={{ fontSize: 40, color: '#d97706', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#b45309' }}>
                                {stats ? stats.ipfsCount : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#78350f', fontWeight: 500 }}>
                                IPFS Hosted
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#78350f' }}>
                                Decentralized Storage
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tools Section */}
            <Grid container spacing={4} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}>
                    <SecureUploadForm onUploadSuccess={() => { fetchStats(); fetchFiles(); }} />
                </Grid>
                <Grid item xs={12} md={6}>
                    <SecureVerifyForm />
                </Grid>
            </Grid>

            {/* Data Table */}
            <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    Stored Files Directory
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <TextField
                        label="Search Files"
                        variant="outlined"
                        size="small"
                        value={search}
                        onChange={handleSearchChange}
                        sx={{ flexGrow: 1 }}
                    />
                    <TextField
                        select
                        label="Filter Type"
                        variant="outlined"
                        size="small"
                        value={filterType}
                        onChange={handleFilterChange}
                        sx={{ minWidth: 200 }}
                    >
                        <MenuItem value="All">All Files</MenuItem>
                        <MenuItem value="EMR">EMR Files</MenuItem>
                        <MenuItem value="MedicalCertificate">Medical Certificates</MenuItem>
                        <MenuItem value="LabReport">Lab Reports</MenuItem>
                        <MenuItem value="Prescription">Prescriptions</MenuItem>
                        <MenuItem value="InsuranceClaim">Insurance Documents</MenuItem>
                        <MenuItem value="General">General</MenuItem>
                    </TextField>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                <TableCell sx={{ fontWeight: 600 }}>File Name</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Storage Type</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Owner</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Upload Date</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Encryption Status</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>IPFS Status</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Blockchain Status</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Verification Status</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading && files.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                                        <CircularProgress size={30} />
                                    </TableCell>
                                </TableRow>
                            ) : files.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                        No secure files found matching your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                files.map((row) => (
                                    <TableRow key={row._id} hover>
                                        <TableCell>{row.fileName}</TableCell>
                                        <TableCell>{row.fileType}</TableCell>
                                        <TableCell>{row.patient?.name || 'Unknown'}</TableCell>
                                        <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', px: 1, py: 0.5, borderRadius: 1 }}>
                                                {row.encryptionMethod || 'AES-256-CBC'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {row.ipfsCid ? <Typography variant="caption" sx={{ color: '#059669' }}>Hosted</Typography> : <Typography variant="caption" color="text.secondary">Pending</Typography>}
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {row.transactionHash ? <Typography variant="caption" sx={{ color: '#d97706' }}>Anchored</Typography> : <Typography variant="caption" color="text.secondary">Pending</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">Requires Verification</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button size="small" variant="outlined" onClick={() => handleDownload(row._id)}>
                                                Download
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                
                <TablePagination
                    component="div"
                    count={totalFiles}
                    page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                />
            </Paper>
        </Box>
    );
};

export default SecureStorageDashboard;
