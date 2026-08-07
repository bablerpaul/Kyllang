import { useState } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Alert,
    Grid,
} from '@mui/material';
import {
    Link as LinkIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const BlockchainAnchor = () => {
    const [anchorLoading, setAnchorLoading] = useState(false);
    const [anchorResult, setAnchorResult] = useState(null);

    const handleAnchorLogs = async () => {
        setAnchorLoading(true);
        setAnchorResult(null);
        try {
            const data = await apiFetch('/api/admin/anchor-logs', {
                method: 'POST'
            });
            setAnchorResult({ type: 'success', message: data.message, batchHash: data.batchHash, count: data.processedCount });
        } catch (error) {
            setAnchorResult({ type: 'error', message: error.message || 'Failed to anchor logs' });
        } finally {
            setAnchorLoading(false);
        }
    };

    return (
        <Box>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinkIcon /> Blockchain Audit Anchor
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Card elevation={3}>
                        <CardContent>
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <LinkIcon /> Securing System Integrity
                                </Typography>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    The integrity of administrative actions (like issuing documents or creating users) is critically tracked in our system logs.
                                </Alert>
                                <Alert severity="warning" sx={{ mb: 3 }}>
                                    <strong>Important:</strong> Click the button below to batch all unanchored logs and generate a cryptographic proof (acting as a smart contract placeholder) to ensure these records remain mathematically tamper-proof. This action cannot be undone.
                                </Alert>

                                <Button
                                    variant="contained"
                                    color="primary"
                                    size="large"
                                    startIcon={<LinkIcon />}
                                    onClick={handleAnchorLogs}
                                    disabled={anchorLoading}
                                    sx={{ minWidth: 220, py: 1.5 }}
                                >
                                    {anchorLoading ? 'Anchoring...' : 'Anchor Pending Logs'}
                                </Button>
                            </Box>

                            {anchorResult && (
                                <Alert severity={anchorResult.type} sx={{ mt: 3 }} onClose={() => setAnchorResult(null)}>
                                    <Typography variant="body1">
                                        {anchorResult.message}
                                    </Typography>
                                    {anchorResult.type === 'success' && (
                                        <Box sx={{ mt: 1 }}>
                                            <Typography variant="body2">
                                                <strong>Logs Processed:</strong> {anchorResult.count}
                                            </Typography>
                                            {anchorResult.batchHash && (
                                                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                                    <strong>Batch Hash:</strong> {anchorResult.batchHash}
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default BlockchainAnchor;
