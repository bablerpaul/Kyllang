import PropTypes from 'prop-types';
import {
    Box, Button, Card, CardActions, CardContent, Chip, Stack, Typography,
} from '@mui/material';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

/**
 * DocumentCard — presentation-only card for the patient "My Documents" hub.
 *
 * Renders SAFE, already-prepared metadata only. It fetches nothing, decrypts nothing and never receives
 * ciphertext, keys or credential contents; callers pass display strings and an optional action callback.
 */
const DOCUMENT_TYPES = {
    prescription: { label: 'Prescription', icon: ChecklistOutlinedIcon, color: 'primary' },
    lab_report: { label: 'Lab Report', icon: ScienceOutlinedIcon, color: 'secondary' },
    certificate: { label: 'Medical Certificate', icon: VerifiedUserOutlinedIcon, color: 'success' },
};

const DocumentCard = ({
    type, title, subtitle = null, date = null, doctorLabel = null, status = null, badges = [], details = [],
    actionLabel = null, onAction = null, actionDisabled = false, preview = false,
}) => {
    const meta = DOCUMENT_TYPES[type] || DOCUMENT_TYPES.prescription;
    const Icon = meta.icon;

    return (
        <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderStyle: preview ? 'dashed' : 'solid' }}>
            <CardContent sx={{ flexGrow: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                    <Icon color={meta.color} fontSize="small" />
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                        {meta.label}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    {status && <Chip label={status.label} color={status.color || 'default'} size="small" variant="outlined" />}
                </Stack>

                <Typography variant="subtitle1" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{title}</Typography>
                {subtitle && (
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{subtitle}</Typography>
                )}

                <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                    {date && (
                        <Typography variant="body2"><strong>Date:</strong> {date}</Typography>
                    )}
                    {doctorLabel && (
                        <Typography variant="body2"><strong>{doctorLabel.label}:</strong> {doctorLabel.value}</Typography>
                    )}
                    {details.map((d) => (
                        <Typography key={d.label} variant="body2"><strong>{d.label}:</strong> {d.value}</Typography>
                    ))}
                </Stack>

                {badges.length > 0 && (
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                        {badges.map((b) => (
                            <Chip key={b.label} label={b.label} size="small" color={b.color || 'default'} variant={b.variant || 'filled'} />
                        ))}
                    </Stack>
                )}
            </CardContent>

            {actionLabel && (
                <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                    <Button size="small" variant="outlined" onClick={onAction} disabled={actionDisabled || !onAction}>
                        {actionLabel}
                    </Button>
                </CardActions>
            )}
        </Card>
    );
};

DocumentCard.propTypes = {
    type: PropTypes.oneOf(Object.keys(DOCUMENT_TYPES)).isRequired,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    date: PropTypes.string,
    doctorLabel: PropTypes.shape({ label: PropTypes.string, value: PropTypes.string }),
    status: PropTypes.shape({ label: PropTypes.string, color: PropTypes.string }),
    badges: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, color: PropTypes.string, variant: PropTypes.string })),
    details: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, value: PropTypes.string })),
    actionLabel: PropTypes.string,
    onAction: PropTypes.func,
    actionDisabled: PropTypes.bool,
    preview: PropTypes.bool,
};


export default DocumentCard;
