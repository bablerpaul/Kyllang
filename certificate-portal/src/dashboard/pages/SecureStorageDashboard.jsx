import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, Card, CardContent, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    TextField, MenuItem, Button, TablePagination, Chip, Tooltip
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LinkIcon from '@mui/icons-material/Link';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import StorageIcon from '@mui/icons-material/Storage';

import SecureUploadForm from '../../components/secure-storage/SecureUploadForm';
import SecureVerifyForm from '../../components/secure-storage/SecureVerifyForm';
import { verificationLabel, anchorLabel, providerLabel } from '../../components/secure-storage/storageLabels';
import { apiFetch } from '../../utils/api';

// Human-readable byte count for a REAL size reported by the API (never an estimate).
const formatBytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const SecureStorageDashboard = () => {
    const [stats, setStats] = useState(null);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Per-file result of the last real integrity check (GET /verify/:id): { status } or { error }
    const [verifications, setVerifications] = useState({});
    const [verifying, setVerifying] = useState({});

    // Pagination & Search & Filter
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalFiles, setTotalFiles] = useState(0);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('All');

    const fetchStats = useCallback(async () => {
        try {
            const dataRes = await apiFetch('/api/secure-storage/stats');
            setStats(dataRes.data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchFiles = useCallback(async () => {
        try {
            setLoading(true);
            const query = new URLSearchParams({
                page: page + 1,
                limit: rowsPerPage,
                search: search,
                documentType: filterType
            }).toString();

            const dataRes = await apiFetch(`/api/secure-storage/?${query}`);
            const data = dataRes.data;
            setFiles(data.files || []);
            setTotalFiles(data.total || 0);
            setError(null);
        } catch (err) {
            setError(err.message || 'Failed to fetch secure files');
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, search, filterType]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(0);
    };

    const handleFilterChange = (e) => {
        setFilterType(e.target.value);
        setPage(0);
    };

    const recordVerification = useCallback((id, report) => {
        setVerifications((v) => ({ ...v, [id]: { status: report && report.status } }));
    }, []);

    const handleVerify = async (id) => {
        setVerifying((v) => ({ ...v, [id]: true }));
        try {
            const res = await apiFetch(`/api/secure-storage/verify/${id}`);
            recordVerification(id, res && res.data);
        } catch (err) {
            setVerifications((v) => ({ ...v, [id]: { error: err.message || 'Verification failed' } }));
        } finally {
            setVerifying((v) => ({ ...v, [id]: false }));
        }
    };

    const handleDownload = (row) => {
        fetch(`/api/secure-storage/download/${row._id}`, { credentials: 'include' })
        .then(res => {
            if (!res.ok) throw new Error('Download failed');
            return res.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = row.fileName || `secure_file_${row._id}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => alert(err.message));
    };

    const renderVerification = (row) => {
        const v = verifications[row._id];
        if (verifying[row._id]) return <CircularProgress size={16} />;
        if (!v) return <Typography variant="caption" color="text.secondary">Not verified yet</Typography>;
        if (v.error) return <Tooltip title={v.error}><Chip size="small" color="error" variant="outlined" label="ERROR" /></Tooltip>;
        const l = verificationLabel(v.status);
        return <Chip size="small" color={l.color} label={l.label} />;
    };

    return (
        <Box sx={{ pb: 4 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                Secure Storage Dashboard
            </Typography>

            {/* Status Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: '#e0f2fe', border: '1px solid #bae6fd', height: '100%' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <StorageIcon sx={{ fontSize: 40, color: '#0284c7', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#0369a1' }}>
                                {stats ? stats.totalFiles : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#0c4a6e', fontWeight: 500 }}>
                                Total Files Stored
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#0c4a6e' }} display="block">
                                Original size: {stats && Number.isFinite(stats.originalSizeBytes) ? formatBytes(stats.originalSizeBytes) : 'Not available'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#0c4a6e' }} display="block">
                                Encrypted stored size: {stats && Number.isFinite(stats.encryptedSizeBytes) ? formatBytes(stats.encryptedSizeBytes) : 'Not available'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', height: '100%' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <LockIcon sx={{ fontSize: 40, color: '#16a34a', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#15803d' }}>
                                AES-256
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#14532d', fontWeight: 500 }}>
                                Encrypted at Rest
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#14532d' }}>
                                Server-side encryption before storage
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: '#fdf4ff', border: '1px solid #fbcfe8', height: '100%' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <LinkIcon sx={{ fontSize: 40, color: '#c026d3', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#a21caf' }}>
                                {stats ? stats.anchoredCount : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#701a75', fontWeight: 500 }}>
                                Blockchain Anchored
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#701a75' }}>
                                Ciphertext SHA-256 committed on-chain
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: '#fef3c7', border: '1px solid #fde68a', height: '100%' }}>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <CloudQueueIcon sx={{ fontSize: 40, color: '#d97706', mb: 1 }} />
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#b45309' }}>
                                {stats ? `${stats.ipfsCount ?? 0} / ${stats.localFallbackCount ?? 0}` : <CircularProgress size={24} />}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#78350f', fontWeight: 500 }}>
                                IPFS / Local Fallback
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#78350f' }}>
                                Where encrypted payloads are stored
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tools Section */}
            <Grid container spacing={4} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <SecureUploadForm onUploadSuccess={() => { fetchStats(); fetchFiles(); }} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <SecureVerifyForm onVerified={recordVerification} />
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
                                <TableCell sx={{ fontWeight: 600 }}>Document Type</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Owner</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Upload Date</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Encryption</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Storage</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Blockchain</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Verification</TableCell>
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
                                files.map((row) => {
                                    const provider = providerLabel(row.storageProvider);
                                    const anchor = anchorLabel(row.blockchainStatus);
                                    return (
                                        <TableRow key={row._id} hover>
                                            <TableCell>
                                                <Typography variant="body2">{row.fileName}</Typography>
                                                {row.linkedCertificate && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, userSelect: 'all' }}>
                                                        Linked Cert ID: {row.linkedCertificate}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>{row.fileType}</TableCell>
                                            <TableCell>{row.ownerName || '—'}</TableCell>
                                            <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', px: 1, py: 0.5, borderRadius: 1 }}>
                                                    {row.encryptionMethod || '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip size="small" variant="outlined" color={provider.color} label={provider.label} />
                                            </TableCell>
                                            <TableCell>
                                                {row.transactionHash ? (
                                                    <Tooltip title={`Tx ${row.transactionHash}`}>
                                                        <Chip size="small" color={anchor.color} label={anchor.label} />
                                                    </Tooltip>
                                                ) : (
                                                    <Chip size="small" color={anchor.color} label={anchor.label} />
                                                )}
                                            </TableCell>
                                            <TableCell>{renderVerification(row)}</TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                <Button size="small" onClick={() => handleVerify(row._id)} disabled={!!verifying[row._id]} sx={{ mr: 1 }}>
                                                    Verify
                                                </Button>
                                                <Button size="small" variant="outlined" onClick={() => handleDownload(row)}>
                                                    Download
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
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
