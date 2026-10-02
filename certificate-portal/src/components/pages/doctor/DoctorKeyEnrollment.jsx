import { useState, useEffect, useCallback } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Paper, TextField, Typography,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import {
    DOCTOR_KEY_STATUS, MIN_PASSPHRASE_LENGTH, discardPendingDoctorKey, enrollDoctorKey, getDoctorKeyStatus,
    resumeDoctorKeyEnrollment,
} from '../../../utils/doctorKeyVault';

/**
 * DoctorKeyEnrollment — the doctor's certificate-access encryption key (X25519), kept only in this browser.
 * Generates the keypair locally, protects the private key with a passphrase in the doctor vault, and registers ONLY
 * the public key (PUT /api/doctor/public-key). Enrollment only: an existing registered key is never replaced.
 * Not required for issuing certificates.
 */
const DoctorKeyEnrollment = () => {
    const [keyStatus, setKeyStatus] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState(null); // 'enroll' | 'resume' | null
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [dialogError, setDialogError] = useState('');
    const [notice, setNotice] = useState(null); // { severity, text }

    const refresh = useCallback(async () => {
        try {
            const { status } = await getDoctorKeyStatus();
            setKeyStatus(status);
            setLoadError('');
        } catch (err) {
            console.error('Doctor key status check failed:', err?.code || err?.status);
            setKeyStatus(null);
            setLoadError('Could not check your encryption key status.');
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const clearSecrets = () => {
        setPassphrase('');
        setConfirmPassphrase('');
    };

    const openDialog = (kind) => {
        clearSecrets();
        setDialogError('');
        setNotice(null);
        setDialog(kind);
    };

    const closeDialog = () => {
        if (busy) return;
        clearSecrets();
        setDialogError('');
        setDialog(null);
    };

    const handleSubmit = async () => {
        const kind = dialog;
        const entered = passphrase;
        const confirmed = confirmPassphrase;
        clearSecrets(); // the passphrase lives only in this call from here on

        if (kind === 'enroll') {
            if (entered.length < MIN_PASSPHRASE_LENGTH) {
                setDialogError(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
                return;
            }
            if (entered !== confirmed) {
                setDialogError('Passphrases do not match.');
                return;
            }
        } else if (!entered) {
            setDialogError('Enter the passphrase you chose when you started the setup.');
            return;
        }

        setBusy(true);
        setDialogError('');
        try {
            if (kind === 'enroll') await enrollDoctorKey(entered);
            else await resumeDoctorKeyEnrollment(entered);
            setDialog(null);
            setNotice({ severity: 'success', text: 'Encryption key enrolled. Your private key is protected in this browser only.' });
        } catch (err) {
            console.error('Doctor key enrollment did not complete:', err?.code || err?.status);
            const safe = err?.code ? err.message : 'Encryption key enrollment failed. Please try again.';
            if (err?.code === 'WRONG_PASSPHRASE' || err?.code === 'WEAK_PASSPHRASE') {
                setDialogError(safe);
            } else {
                setDialog(null);
                setNotice({ severity: err?.code === 'PENDING' ? 'warning' : 'error', text: safe });
            }
        } finally {
            setBusy(false);
            await refresh();
        }
    };

    const handleDiscard = async () => {
        setBusy(true);
        setNotice(null);
        try {
            await discardPendingDoctorKey();
            setNotice({ severity: 'info', text: 'The unfinished key was discarded. You can set up a new key.' });
        } catch (err) {
            setNotice({ severity: 'warning', text: err?.code ? err.message : 'Could not discard the unfinished key.' });
        } finally {
            setBusy(false);
            await refresh();
        }
    };

    const statusView = () => {
        switch (keyStatus) {
            case DOCTOR_KEY_STATUS.MATCH:
                return <Alert severity="success">Encryption key: <strong>Enrolled</strong>. Your private key is stored, encrypted, in this browser.</Alert>;
            case DOCTOR_KEY_STATUS.UNREGISTERED:
                return (
                    <>
                        <Alert severity="info" sx={{ mb: 2 }}>Encryption key: <strong>Not set up</strong>.</Alert>
                        <Button variant="contained" startIcon={<SecurityIcon />} onClick={() => openDialog('enroll')} disabled={busy}>
                            Set Up Encryption Key
                        </Button>
                    </>
                );
            case DOCTOR_KEY_STATUS.PENDING:
                return (
                    <>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Encryption key: <strong>setup not finished</strong>. A key was created in this browser but the server has not
                            confirmed it. Finish with the same passphrase, or discard it and start again.
                        </Alert>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button variant="contained" onClick={() => openDialog('resume')} disabled={busy}>Finish setup</Button>
                            <Button variant="outlined" color="warning" onClick={handleDiscard} disabled={busy}>Discard and start over</Button>
                        </Box>
                    </>
                );
            case DOCTOR_KEY_STATUS.MISSING:
                return (
                    <Alert severity="warning">
                        Encryption key: <strong>Enrolled</strong>, but its private key is not in this browser. It is stored only in the
                        browser or device where it was set up — please use that one to open shared certificates.
                    </Alert>
                );
            case DOCTOR_KEY_STATUS.MISMATCH:
                return (
                    <Alert severity="error">
                        The encryption key saved in this browser does not match the key registered for your account, so it will not
                        be used. Please use the browser or device where your registered key was set up.
                    </Alert>
                );
            default:
                return loadError
                    ? <Alert severity="error">{loadError}</Alert>
                    : <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>;
        }
    };

    return (
        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Typography variant="h6" fontWeight="700" gutterBottom>Certificate Access Encryption Key</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Patients use this key to share existing certificates with you. Your private key is created and kept only in this
                browser, protected by your passphrase. It is not needed for issuing certificates.
            </Typography>
            {notice && <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
            {statusView()}

            <Dialog open={dialog !== null} onClose={closeDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{dialog === 'resume' ? 'Finish Encryption Key Setup' : 'Set Up Encryption Key'}</DialogTitle>
                <DialogContent>
                    {dialog === 'enroll' ? (
                        <DialogContentText component="div" sx={{ mb: 2 }}>
                            This creates your encryption key in this browser. Choose a passphrase (min. {MIN_PASSPHRASE_LENGTH} characters)
                            to protect it.
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                Remember this passphrase. It is never sent to the server and cannot be recovered. If you lose it, or
                                this browser&apos;s data is cleared, certificates shared with you can no longer be opened.
                            </Alert>
                        </DialogContentText>
                    ) : (
                        <DialogContentText sx={{ mb: 2 }}>
                            Enter the passphrase you chose when you started the setup. The same key will be registered — no new key is created.
                        </DialogContentText>
                    )}
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Passphrase"
                        type="password"
                        fullWidth
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        disabled={busy}
                        slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
                    />
                    {dialog === 'enroll' && (
                        <TextField
                            margin="dense"
                            label="Confirm Passphrase"
                            type="password"
                            fullWidth
                            value={confirmPassphrase}
                            onChange={(e) => setConfirmPassphrase(e.target.value)}
                            disabled={busy}
                            slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
                        />
                    )}
                    {busy && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2" color="text.secondary">Securing your key…</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={busy}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={busy}>
                        {dialog === 'resume' ? 'Finish Setup' : 'Set Up Key'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default DoctorKeyEnrollment;
