import { useState } from 'react';
import PropTypes from 'prop-types';
import { 
    Alert, Button, Paper, Typography, Box, 
    Dialog, DialogTitle, DialogContent, DialogContentText,
    TextField, DialogActions, Checkbox, FormControlLabel
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { apiFetch } from '../../../utils/api';
import { storePatientPrivateKey } from '../../../utils/patientKeyVault';
import { useAuth } from '../../../contexts/AuthContext';

// Word the patient must type before a re-enrollment (key rotation) can proceed.
const RE_ENROLL_CONFIRMATION = 'RE-ENROLL';

/**
 * PatientKeyEnrollment
 *
 * Generates a TweetNaCl X25519 (Curve25519) keypair entirely in the browser.
 *   - Public key → sent to backend PUT /api/patient/public-key (auth required)
 *   - Private key → encrypted with PBKDF2+AES-GCM and stored in IndexedDB only
 *
 * Props:
 *   onEnrolled  {Function} optional callback fired after successful enrollment
 *   compact     {Boolean}  when true, renders only the button (for use in Alert action slots)
 *   isRotation  {Boolean}  when true, acts as a rotation/re-enrollment UI — gated by a risk warning that requires an
 *                          acknowledgement checkbox AND typing RE-ENROLL before the passphrase step is reachable
 */
const PatientKeyEnrollment = ({ onEnrolled, compact = false, isRotation = false }) => {
    const { userId } = useAuth();
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    
    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [dialogError, setDialogError] = useState('');
    // Re-enrollment replaces the server key, so it starts with a mandatory risk-acknowledgement step.
    const [step, setStep] = useState('passphrase'); // 'warning' | 'passphrase'
    const [acknowledged, setAcknowledged] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const riskConfirmed = acknowledged && confirmText.trim() === RE_ENROLL_CONFIRMATION;

    const openDialog = () => {
        setDialogOpen(true);
        setStep(isRotation ? 'warning' : 'passphrase');
        setAcknowledged(false);
        setConfirmText('');
        setPassphrase('');
        setConfirmPassphrase('');
        setDialogError('');
        setStatus('');
    };

    const closeDialog = () => {
        setDialogOpen(false);
    };

    const handleConfirm = async () => {
        if (isRotation && !riskConfirmed) {
            setStep('warning');
            return;
        }
        if (!passphrase) {
            setDialogError('Passphrase is required.');
            return;
        }
        if (passphrase.length < 12) {
            setDialogError('Use a passphrase of at least 12 characters.');
            return;
        }
        if (passphrase !== confirmPassphrase) {
            setDialogError('Passphrases do not match.');
            return;
        }

        setDialogError('');
        setDialogOpen(false);
        setBusy(true);
        setStatus('');
        
        try {
            // 1. Generate X25519 keypair entirely in-browser
            const keyPair = nacl.box.keyPair();
            const publicKey = util.encodeBase64(keyPair.publicKey);   // 32-byte, base64
            const privateKey = util.encodeBase64(keyPair.secretKey);  // 32-byte, base64

            // 2. Send ONLY the public key to the backend
            //    The backend validates it is a 32-byte X25519 key and stores it against req.user._id
            const endpoint = isRotation ? '/api/patient/public-key/rotate' : '/api/patient/public-key';
            await apiFetch(endpoint, {
                method: 'PUT',
                body: JSON.stringify({ publicKey }),
            });

            // 3. Store private key encrypted in IndexedDB — never leaves this browser — in this account's own slot
            await storePatientPrivateKey(privateKey, passphrase, { userId });

            const successMsg = 'Encryption key enrolled. Your private key is protected in this browser only.';
            setStatus(successMsg);
            if (typeof onEnrolled === 'function') onEnrolled();
        } catch (error) {
            setStatus(error.message || 'Encryption key enrollment failed.');
        } finally {
            setBusy(false);
        }
    };

    const renderWarning = () => (
        <>
            <DialogTitle>Before you re-enroll your security key</DialogTitle>
            <DialogContent>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Re-enrolling may permanently remove your access to credentials that were already issued to you.
                </Alert>
                <DialogContentText component="div" sx={{ mb: 2 }}>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li>Your existing private key may still be stored in <strong>another browser or device</strong> where you set it up. It is stored only there — Kyllang&apos;s server never has it and cannot recover it.</li>
                        <li>Re-enrolling creates a <strong>new</strong> key and replaces the key registered for your account. It does not recover the old key.</li>
                        <li>Credentials already issued to you remain encrypted to your old key. Without that key they can no longer be opened.</li>
                        <li>New credentials will be encrypted to the new key.</li>
                    </ul>
                </DialogContentText>
                <Alert severity="info" sx={{ mb: 2 }}>
                    First try signing in from the browser or device that holds your existing key. Only continue if that is no longer possible.
                </Alert>
                <FormControlLabel
                    control={<Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />}
                    label="I understand that re-enrolling may permanently remove access to credentials encrypted to my previous key."
                    sx={{ mb: 1 }}
                />
                <TextField
                    margin="dense"
                    label={`Type ${RE_ENROLL_CONFIRMATION} to confirm`}
                    fullWidth
                    variant="outlined"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={closeDialog} variant="contained" color="primary">Cancel — keep my current key</Button>
                <Button onClick={() => setStep('passphrase')} color="error" disabled={!riskConfirmed}>
                    Continue to re-enroll
                </Button>
            </DialogActions>
        </>
    );

    const renderDialog = () => (
        <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
            {isRotation && step === 'warning' ? renderWarning() : renderPassphraseStep()}
        </Dialog>
    );

    const renderPassphraseStep = () => (
        <>
            <DialogTitle>
                {isRotation ? 'Reset / Re-enroll Security Key' : 'Set Up Security Key'}
            </DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>
                    Create a passphrase to protect your local encryption key (min. 12 characters).<br /><br />
                    <strong>IMPORTANT:</strong> Remember this passphrase. It is never sent to the server and cannot be recovered if lost.
                </DialogContentText>
                {dialogError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {dialogError}
                    </Alert>
                )}
                <TextField
                    autoFocus
                    margin="dense"
                    label="Passphrase"
                    type="password"
                    fullWidth
                    variant="outlined"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    sx={{ mb: 2 }}
                />
                <TextField
                    margin="dense"
                    label="Confirm Passphrase"
                    type="password"
                    fullWidth
                    variant="outlined"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') handleConfirm();
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={closeDialog} color="inherit">Cancel</Button>
                <Button onClick={handleConfirm} variant="contained" color={isRotation ? 'error' : 'primary'} disabled={isRotation && !riskConfirmed}>
                    {isRotation ? 'Reset / Re-enroll' : 'Set Up Key'}
                </Button>
            </DialogActions>
        </>
    );

    // Compact mode: just the button (used as Alert action)
    if (compact) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                <Button
                    id="patient-key-enroll-btn"
                    variant="contained"
                    size="small"
                    startIcon={<SecurityIcon />}
                    onClick={openDialog}
                    disabled={busy}
                    color="warning"
                >
                    {busy ? (isRotation ? 'Rotating...' : 'Enrolling...') : (isRotation ? 'Reset / Re-enroll Key' : 'Set Up Key')}
                </Button>
                {status && (
                    <Typography variant="caption" color={status.startsWith('Encryption key enrolled') ? 'success.main' : 'error.main'}>
                        {status}
                    </Typography>
                )}
                {renderDialog()}
            </Box>
        );
    }

    // Standalone full-card mode
    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Secure Certificate Setup</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                Set up your private encryption key to receive future zero-knowledge certificate credentials securely.
                Your private key will be encrypted and stored only in this browser.
            </Typography>
            <Button
                id="patient-key-enroll-btn-full"
                variant="contained"
                startIcon={<SecurityIcon />}
                onClick={openDialog}
                disabled={busy}
            >
                {busy ? (isRotation ? 'Rotating...' : 'Enrolling...') : (isRotation ? 'Reset / Re-enroll Key' : 'Set Up Encryption Key')}
            </Button>
            {status && (
                <Alert
                    severity={status.startsWith('Encryption key enrolled') ? 'success' : 'error'}
                    sx={{ mt: 2 }}
                >
                    {status}
                </Alert>
            )}
            {renderDialog()}
        </Paper>
    );
};

PatientKeyEnrollment.propTypes = {
    onEnrolled: PropTypes.func,
    compact: PropTypes.bool,
    isRotation: PropTypes.bool,
};

export default PatientKeyEnrollment;
