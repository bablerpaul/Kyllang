// Display labels for Secure Storage states. Every label is derived from a value the backend returned — nothing is
// assumed from the mere existence of a record.

// GET /api/secure-storage/verify/:id → data.status (storageService.verifyIntegrity)
const VERIFICATION = {
    VERIFIED: { label: 'VERIFIED', color: 'success' },
    BLOCKCHAIN_PENDING: { label: 'PENDING', color: 'info' },
    BLOCKCHAIN_FAILED: { label: 'FAILED', color: 'error' },
    BLOCKCHAIN_RECORD_NOT_FOUND: { label: 'NOT FOUND', color: 'warning' },
    INTEGRITY_MISMATCH: { label: 'INTEGRITY MISMATCH', color: 'error' },
};
export const verificationLabel = (status) => VERIFICATION[status] || { label: status ? String(status) : 'UNKNOWN', color: 'warning' };

// FileVersion.blockchainStatus (worker lifecycle)
const ANCHOR = {
    confirmed: { label: 'Confirmed', color: 'success' },
    processing: { label: 'Processing', color: 'info' },
    pending: { label: 'Pending', color: 'default' },
    failed: { label: 'Failed', color: 'error' },
};
export const anchorLabel = (status) => ANCHOR[status] || { label: 'Unknown', color: 'default' };

// storageProvider from the API (backend utils/storageProvider.js)
const PROVIDER = {
    ipfs: { label: 'IPFS (Kubo)', color: 'success' },
    local_fallback: { label: 'Local encrypted fallback', color: 'warning' },
};
export const providerLabel = (provider) => PROVIDER[provider] || { label: 'Unknown', color: 'default' };
