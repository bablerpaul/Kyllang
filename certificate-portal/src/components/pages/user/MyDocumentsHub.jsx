import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
    Alert, Box, Chip, CircularProgress, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs,
    TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DocumentCard from './DocumentCard';
import { apiFetch } from '../../../utils/api';
import { normalizePrescription } from '../../../utils/myDocuments';

/**
 * MyDocumentsHub — the patient's unified "My Documents" page (prescriptions, lab reports, medical certificates).
 *
 * Connected so far: PRESCRIPTIONS ONLY (Step 68), from the existing session-scoped GET /api/emr/prescriptions.
 * Records are reduced to safe display summaries by normalizePrescription() immediately; raw records (medication
 * contents, instructions, signature hash, patient email) are never kept in state or rendered. Each card opens the
 * existing Prescriptions page. Lab reports and certificates are not connected yet. Nothing is persisted, no browser
 * storage or vault is touched and nothing is decrypted. The legacy PatientDocument page lives at
 * /dashboard/encrypted-documents and is not part of this hub.
 */
const CATEGORY_TABS = [
    { value: 'all', label: 'All' },
    { value: 'prescription', label: 'Prescriptions' },
    { value: 'lab_report', label: 'Lab Reports' },
    { value: 'certificate', label: 'Certificates' },
];

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'type', label: 'Type' },
];

// Layout previews for the document types that are NOT connected yet — clearly labelled examples, not patient records.
const LAYOUT_PREVIEWS = [
    {
        type: 'lab_report',
        title: 'Test name',
        subtitle: 'Investigation category · test type',
        date: 'Report date',
        doctorLabel: { label: 'Ordered by', value: 'Doctor / lab' },
        status: { label: 'Status' },
        badges: [
            { label: 'Manual', variant: 'outlined' },
            { label: 'Uploaded', variant: 'outlined' },
            { label: 'Legacy', variant: 'outlined' },
            { label: 'Secure file', variant: 'outlined' },
        ],
        actionLabel: 'View',
    },
    {
        type: 'certificate',
        title: 'Medical Certificate',
        subtitle: 'Certificate reference',
        doctorLabel: { label: 'Issued by', value: 'Issuing doctor' },
        details: [{ label: 'Validity', value: 'Valid from – valid until' }],
        status: { label: 'Active / Expired / Revoked' },
        badges: [
            { label: 'Encrypted', variant: 'outlined' },
            { label: 'Imported', variant: 'outlined' },
        ],
        actionLabel: 'View',
    },
];

const CONNECTED_TYPES = ['prescription'];
const OPEN_LABEL = { prescription: 'Open Prescriptions' };

// Normalized summary → existing DocumentCard props (presentation adapter only).
const toCardProps = (summary, navigate) => ({
    type: summary.documentType,
    title: summary.title,
    subtitle: summary.subtitle,
    date: summary.dateLabel,
    doctorLabel: { label: summary.doctorRole, value: summary.doctorName },
    status: { label: summary.statusLabel, color: summary.statusColor },
    badges: summary.badges.map((b) => ({ label: b.label, variant: 'outlined' })),
    details: summary.extraDetails,
    actionLabel: OPEN_LABEL[summary.documentType] || 'Open',
    onAction: () => navigate(summary.openRoute),
});

const EmptyState = ({ title, body, testId }) => (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', mb: 4 }} data-testid={testId}>
        <FolderOpenOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{body}</Typography>
    </Paper>
);

EmptyState.propTypes = {
    title: PropTypes.string.isRequired,
    body: PropTypes.string.isRequired,
    testId: PropTypes.string.isRequired,
};

const MyDocumentsHub = () => {
    const navigate = useNavigate();
    // Local UI state only — never persisted, never sent anywhere, never placed in the URL.
    const [category, setCategory] = useState('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('newest');
    // Prescription source: safe summaries only.
    const [prescriptions, setPrescriptions] = useState({ state: 'loading', items: [] });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetch('/api/emr/prescriptions');
                const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                const items = list.map(normalizePrescription).filter(Boolean);
                if (!cancelled) setPrescriptions({ state: 'ready', items });
            } catch (err) {
                console.error('My Documents: prescriptions could not be loaded:', err?.status);
                if (!cancelled) setPrescriptions({ state: 'error', items: [] });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const showPrescriptions = category === 'all' || category === 'prescription';
    const previews = LAYOUT_PREVIEWS.filter((p) => !CONNECTED_TYPES.includes(p.type) && (category === 'all' || category === p.type));

    let body = null;
    if (showPrescriptions) {
        if (prescriptions.state === 'loading') {
            body = (
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'center', py: 6, mb: 4 }} data-testid="my-documents-loading">
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">Loading prescriptions…</Typography>
                </Stack>
            );
        } else if (prescriptions.state === 'error') {
            body = (
                <Alert severity="error" sx={{ mb: 4 }} data-testid="my-documents-prescriptions-error">
                    Your prescriptions could not be loaded right now. Please try again later, or open Prescriptions from the menu.
                </Alert>
            );
        } else if (prescriptions.items.length === 0) {
            body = category === 'prescription'
                ? <EmptyState testId="my-documents-empty" title="No prescriptions yet" body="Prescriptions issued to you will appear here." />
                : (
                    <EmptyState
                        testId="my-documents-empty"
                        title="No documents listed yet"
                        body="You have no prescriptions yet. Lab reports and medical certificates will be added to this page soon — until then, open them from Lab Reports and My Certificates in the menu."
                    />
                );
        } else {
            body = (
                <Box
                    data-testid="my-documents-list"
                    sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, mb: 4 }}
                >
                    {prescriptions.items.map((s) => <DocumentCard key={s.key} {...toCardProps(s, navigate)} />)}
                </Box>
            );
        }
    } else {
        const label = category === 'lab_report' ? 'Lab reports' : 'Medical certificates';
        const page = category === 'lab_report' ? 'Lab Reports' : 'My Certificates';
        body = (
            <EmptyState
                testId="my-documents-empty"
                title="No documents yet"
                body={`${label} will appear here soon. Until then, open them from ${page} in the menu.`}
            />
        );
    }

    return (
        <Box>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                My Documents
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Your prescriptions, lab reports and medical certificates in one place.
            </Typography>

            <Paper variant="outlined" sx={{ mb: 3 }}>
                <Tabs
                    value={category}
                    onChange={(_, value) => setCategory(value)}
                    variant="scrollable"
                    scrollButtons="auto"
                    aria-label="Document categories"
                >
                    {CATEGORY_TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
                </Tabs>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
                <TextField
                    label="Search documents"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled
                    fullWidth
                    size="small"
                    helperText="Search will be available once all document types are listed here."
                    slotProps={{
                        input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
                        htmlInput: { autoComplete: 'off' },
                    }}
                />
                <FormControl size="small" sx={{ minWidth: 200 }} disabled>
                    <InputLabel id="my-documents-sort-label">Sort by</InputLabel>
                    <Select
                        labelId="my-documents-sort-label"
                        label="Sort by"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                    >
                        {SORT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                    </Select>
                </FormControl>
            </Stack>

            {body}

            {previews.length > 0 && (
                <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">Coming soon to this page</Typography>
                        <Chip label="Layout preview — not your records" size="small" variant="outlined" />
                    </Stack>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        These cards only show the planned layout. They contain no patient data.
                    </Alert>
                    <Box
                        data-testid="my-documents-layout-preview"
                        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}
                    >
                        {previews.map((p) => (
                            <DocumentCard key={p.type} {...p} actionDisabled preview />
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
};

export default MyDocumentsHub;
