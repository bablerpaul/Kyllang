import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, TextField, Typography, CircularProgress, Alert } from '@mui/material';
import { verificationLabel, anchorLabel, providerLabel } from './storageLabels';

const Mono = ({ children }) => (
    <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{children}</Typography>
);
Mono.propTypes = { children: PropTypes.node };

/**
 * SecureVerifyForm
 * GET /api/secure-storage/verify/:id responds { success, message, data: report } where report is
 *   { message, status, verificationDetails: { verified, generatedHash, expectedHash, onChainDetails },
 *     blockchain: { status, transactionHash, blockNumber }, storage: { provider, versionNumber },
 *     documentDetails: { fileName, fileType, encryptionMethod, owner, uploadDate }, linkedEntity: { type, id } }
 */
const SecureVerifyForm = ({ initialFileId = '', onVerified }) => {
    const [documentId, setDocumentId] = useState(initialFileId);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleVerify = async () => {
        if (!documentId) {
            setError('Please provide a File ID to verify.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch(`/api/secure-storage/verify/${encodeURIComponent(documentId.trim())}`, {
                method: 'GET',
                credentials: 'include',
            });
            const resData = await response.json().catch(() => null);

            if (!response.ok) {
                const message = response.status < 500 && resData && resData.message ? resData.message : 'Verification failed. Please try again.';
                throw new Error(message);
            }

            const report = resData && resData.data;
            setResult(report);
            if (typeof onVerified === 'function') onVerified(documentId.trim(), report);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const status = result ? verificationLabel(result.status) : null;
    const details = (result && result.verificationDetails) || {};
    const chain = (result && result.blockchain) || {};
    const storage = (result && result.storage) || {};
    const doc = (result && result.documentDetails) || {};

    return (
        <Box sx={{ p: 3, border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: 'background.paper', mb: 3 }}>
            <Typography variant="h6" gutterBottom>
                Verify File Integrity
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {result && (
                <Alert severity={status.color === 'default' ? 'info' : status.color} sx={{ mb: 2 }}>
                    <strong>{status.label}</strong> — {result.message}<br /><br />
                    {doc.fileName && <>File: {doc.fileName}{doc.fileType ? ` (${doc.fileType})` : ''}<br /></>}
                    {doc.owner && <>Owner: {doc.owner}<br /></>}
                    Stored hash: <Mono>{details.expectedHash || '—'}</Mono><br />
                    Calculated hash: <Mono>{details.generatedHash || '—'}</Mono><br />
                    Hashes match: {details.expectedHash && details.generatedHash ? (details.expectedHash === details.generatedHash ? 'yes' : 'NO') : '—'}<br /><br />
                    Blockchain status: {chain.status ? anchorLabel(chain.status).label : '—'}<br />
                    {chain.transactionHash && <>Transaction: <Mono>{chain.transactionHash}</Mono><br /></>}
                    {chain.blockNumber !== null && chain.blockNumber !== undefined && <>Block: {chain.blockNumber}<br /></>}
                    {details.onChainDetails && (
                        <>On-chain record: {details.onChainDetails.recordType} · {new Date(details.onChainDetails.timestamp * 1000).toLocaleString()}<br /></>
                    )}
                    Storage: {providerLabel(storage.provider).label}{storage.versionNumber ? ` · version ${storage.versionNumber}` : ''}
                </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="File ID"
                    variant="outlined"
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    fullWidth
                />
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleVerify}
                    disabled={loading}
                >
                    {loading ? <CircularProgress size={24} /> : 'Verify Integrity'}
                </Button>
            </Box>
        </Box>
    );
};

SecureVerifyForm.propTypes = {
    initialFileId: PropTypes.string,
    onVerified: PropTypes.func,
};

export default SecureVerifyForm;
