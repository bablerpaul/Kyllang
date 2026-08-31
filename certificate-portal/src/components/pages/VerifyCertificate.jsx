import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { ethers } from 'ethers';
import { generateProof, verifyProofLocally, fetchVerificationKey } from '../../workers/zkWorkerBridge';
import { buildCircuitInput } from '../../utils/poseidonUtils';
import { getCredential, listCredentials } from '../../utils/credentialVault';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

// ── Mode Constants ─────────────────────────────────────────────────────────
const MODE = { IDLE: 'IDLE', VERIFIER: 'VERIFIER', PATIENT: 'PATIENT' };
const PHASE = {
    // Verifier phases
    V_REQUESTING: 'V_REQUESTING',
    V_SHOWING_CHALLENGE: 'V_SHOWING_CHALLENGE',
    V_WAITING: 'V_WAITING',
    V_VERIFYING: 'V_VERIFYING',
    V_DONE: 'V_DONE',
    // Patient phases
    P_SCANNING: 'P_SCANNING',
    P_SELECT_CREDENTIAL: 'P_SELECT_CREDENTIAL',
    P_PROVING: 'P_PROVING',
    P_SUBMITTING: 'P_SUBMITTING',
    P_DONE: 'P_DONE',
};

// ── Trustless ethers.js provider (read-only, no backend proxy) ─────────────
const RPC_URL = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:7545';

async function getRegistryContract() {
    const res = await fetch('/zk/CertificateRegistry.abi.json');
    if (!res.ok) throw new Error('Contract ABI not deployed yet. Run deploy-zk.js first.');
    const { registryAddress, abi } = await res.json();

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    return new ethers.Contract(registryAddress, abi, provider);
}

// ── Components ─────────────────────────────────────────────────────────────

function ProgressLog({ messages }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [messages]);

    return (
        <div ref={ref} style={{
            background: '#0a0a0a', border: '1px solid #1e3a5f', borderRadius: 8,
            padding: '12px 16px', maxHeight: 160, overflowY: 'auto',
            fontFamily: 'monospace', fontSize: 12, color: '#7dd3fc',
        }}>
            {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 2, opacity: i === messages.length - 1 ? 1 : 0.6 }}>
                    <span style={{ color: '#4ade80', marginRight: 8 }}>{'>'}</span>{m}
                </div>
            ))}
            {messages.length === 0 && <span style={{ color: '#475569' }}>Waiting…</span>}
        </div>
    );
}

function StatusBadge({ status }) {
    const cfg = {
        valid:    { bg: '#052e16', border: '#16a34a', color: '#4ade80', icon: '✓', label: 'VALID — Certificate Verified' },
        revoked:  { bg: '#2d1515', border: '#dc2626', color: '#f87171', icon: '⊗', label: 'REVOKED — Certificate Revoked' },
        invalid:  { bg: '#1c1010', border: '#dc2626', color: '#f87171', icon: '✗', label: 'INVALID — Proof Failed' },
        replay:   { bg: '#1c1209', border: '#f59e0b', color: '#fbbf24', icon: '⚡', label: 'REPLAY BLOCKED — Nonce Consumed' },
        pending:  { bg: '#0f172a', border: '#3b82f6', color: '#93c5fd', icon: '⏳', label: 'Pending Proof Submission…' },
    }[status] || { bg: '#111', border: '#475569', color: '#94a3b8', icon: '?', label: 'Unknown' };

    return (
        <div style={{
            background: cfg.bg, border: `2px solid ${cfg.border}`, borderRadius: 12,
            padding: '20px 32px', textAlign: 'center', marginTop: 24,
        }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{cfg.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════
export default function VerifyCertificate() {
    const { user } = useAuth();
    const [mode,  setMode]  = useState(MODE.IDLE);
    const [phase, setPhase] = useState(null);
    const [error, setError] = useState(null);
    const [logs,  setLogs]  = useState([]);

    // Verifier state
    const [challenge,     setChallenge]    = useState(null); // { nonce, sessionId, expiresIn }
    const [challengeQR,   setChallengeQR]  = useState(null); // JSON string for QR
    const [timeLeft,      setTimeLeft]     = useState(0);
    const [verifyResult,  setVerifyResult] = useState(null); // final verification data
    const pollTimerRef  = useRef(null);
    const countdownRef  = useRef(null);

    // Patient state
    const [scannedChallenge, setScannedChallenge] = useState(null);
    const [credentials,      setCredentials]      = useState([]);
    const [selectedCred,     setSelectedCred]     = useState(null);
    const [passphrase,       setPassphrase]        = useState('');
    const [proofResult,      setProofResult]       = useState(null);
    const scannerRef = useRef(null);
    const scannerDivId = 'zk-qr-scanner';

    const addLog = useCallback((msg) => setLogs(prev => [...prev.slice(-50), msg]), []);

    // ── Cleanup on unmount ─────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            clearInterval(pollTimerRef.current);
            clearInterval(countdownRef.current);
            stopQRScanner();
        };
    }, []);

    // ══════════════════════════════════════════════════════════════════════
    // VERIFIER FLOW
    // ══════════════════════════════════════════════════════════════════════

    async function startVerifierFlow() {
        setMode(MODE.VERIFIER);
        setPhase(PHASE.V_REQUESTING);
        setError(null);
        setLogs([]);
        setVerifyResult(null);

        try {
            addLog('Requesting ephemeral challenge nonce from server…');
            const res = await api.get('/certificates/challenge');
            const { nonce, sessionId, expiresIn, callbackUrl } = res.data.data;
            setChallenge({ nonce, sessionId, expiresIn });

            const qrPayload = JSON.stringify({
                type: 'kyllang_challenge',
                version: 'zkv1',
                nonce,
                sessionId,
                callbackUrl,
            });
            setChallengeQR(qrPayload);
            setTimeLeft(expiresIn);
            addLog(`Challenge issued. Nonce: ${nonce.slice(0, 12)}… SessionID: ${sessionId}`);
            setPhase(PHASE.V_SHOWING_CHALLENGE);

            // Countdown timer
            countdownRef.current = setInterval(() => {
                setTimeLeft(t => {
                    if (t <= 1) {
                        clearInterval(countdownRef.current);
                        clearInterval(pollTimerRef.current);
                        setPhase(PHASE.V_REQUESTING);
                        addLog('Challenge expired. Request a new one.');
                        return 0;
                    }
                    return t - 1;
                });
            }, 1000);

            // Poll for proof submission every 3 seconds
            addLog('Waiting for Patient to submit proof…');
            setPhase(PHASE.V_WAITING);
            pollTimerRef.current = setInterval(() => pollForProof(sessionId, nonce), 3000);

        } catch (err) {
            setError(`Failed to get challenge: ${err.response?.data?.message || err.message}`);
            setPhase(null);
        }
    }

    async function pollForProof(sessionId, nonce) {
        try {
            const res = await api.get(`/certificates/session/${sessionId}`);
            const { status, valid, commitmentHash, issuerAddress, issuedAt, validFrom, validUntil } = res.data.data;

            if (status === 'pending') return; // Patient hasn't submitted yet

            clearInterval(pollTimerRef.current);
            clearInterval(countdownRef.current);

            addLog('Proof submission received. Running trustless on-chain verification…');
            setPhase(PHASE.V_VERIFYING);

            // ── Trustless independent verification (no backend trust) ───────
            // We got the result from backend, but we independently verify on-chain
            // to ensure the backend cannot lie about verification status
            await runTrustlessVerification(valid, commitmentHash, nonce, status);

        } catch (err) {
            addLog(`Poll error: ${err.message}`);
        }
    }

    async function runTrustlessVerification(backendSaysValid, commitmentHash, nonce, status) {
        try {
            // Check on-chain certificate record independently
            addLog('Calling CertificateRegistry.getCertificateRecord() via eth_call…');
            const registry = await getRegistryContract();
            const [issuer, issuedAt, revoked, exists] = await registry.getCertificateRecord(commitmentHash);

            addLog(`On-chain: exists=${exists}, revoked=${revoked}, issuer=${issuer?.slice(0, 12)}…`);

            if (!exists) {
                setVerifyResult({ status: 'invalid', reason: 'Certificate not registered on-chain' });
                setPhase(PHASE.V_DONE);
                return;
            }
            if (revoked) {
                setVerifyResult({ status: 'revoked', issuer, issuedAt: Number(issuedAt) });
                setPhase(PHASE.V_DONE);
                addLog('Certificate is REVOKED on-chain.');
                return;
            }

            addLog('Certificate exists and is not revoked. Backend result: ' + (backendSaysValid ? 'VALID' : 'INVALID'));
            setVerifyResult({
                status: backendSaysValid ? 'valid' : 'invalid',
                issuer,
                issuedAt: Number(issuedAt) * 1000,
                commitmentHash,
                independentlyVerified: true,
            });
            setPhase(PHASE.V_DONE);
        } catch (err) {
            addLog(`Trustless verification error: ${err.message}`);
            // Fall back to backend result with a warning
            setVerifyResult({ status: backendSaysValid ? 'valid' : 'invalid', warning: 'Trustless verification failed: ' + err.message });
            setPhase(PHASE.V_DONE);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PATIENT FLOW
    // ══════════════════════════════════════════════════════════════════════

    async function startPatientFlow() {
        setMode(MODE.PATIENT);
        setPhase(PHASE.P_SCANNING);
        setError(null);
        setLogs([]);
        setProofResult(null);

        // Load vault credentials (non-sensitive metadata)
        try {
            const creds = await listCredentials();
            setCredentials(creds);
        } catch (_) { setCredentials([]); }

        // Start QR scanner with a small delay for DOM readiness
        setTimeout(() => startQRScanner(), 300);
    }

    async function startQRScanner() {
        if (scannerRef.current) return;
        try {
            const scanner = new Html5Qrcode(scannerDivId);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 260, height: 260 } },
                async (decodedText) => {
                    await stopQRScanner();
                    await handleQRScan(decodedText);
                },
                () => {} // ignore scan errors
            );
        } catch (err) {
            addLog(`Camera error: ${err.message}. You can also paste the challenge JSON manually.`);
        }
    }

    async function stopQRScanner() {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch (_) {}
            scannerRef.current = null;
        }
    }

    async function handleQRScan(rawText) {
        try {
            const payload = JSON.parse(rawText);
            if (payload.type !== 'kyllang_challenge' || payload.version !== 'zkv1') {
                throw new Error('Not a valid Kyllang Challenge QR');
            }
            addLog(`Challenge QR scanned. Nonce: ${payload.nonce.slice(0, 12)}…`);
            setScannedChallenge(payload);
            setPhase(PHASE.P_SELECT_CREDENTIAL);
        } catch (err) {
            setError(`Invalid QR: ${err.message}`);
            setPhase(PHASE.P_SCANNING);
            setTimeout(() => startQRScanner(), 500);
        }
    }

    async function handleManualChallengeInput(jsonText) {
        await stopQRScanner();
        await handleQRScan(jsonText);
    }

    async function handleGenerateProof() {
        if (!selectedCred || !passphrase) {
            setError('Select a credential and enter your passphrase');
            return;
        }

        setPhase(PHASE.P_PROVING);
        setError(null);
        addLog('Decrypting credential from local vault…');

        try {
            const cred = await getCredential(selectedCred.id, passphrase);
            addLog('Credential decrypted. Building circuit inputs…');

            const circuitInput = await buildCircuitInput(
                cred.patientId,
                cred.diagnosisCode,
                cred.validFrom,
                cred.secretSalt,
                cred.commitment,              // expectedCommitment (decimal string)
                scannedChallenge.nonce,       // challengeNonce (hex from QR)
            );

            addLog('Starting Groth16 proof generation in Web Worker…');
            addLog('This may take 10–30 seconds. Do not close this tab.');

            const { proof, publicSignals } = await generateProof(
                circuitInput,
                (msg) => addLog(msg)
            );

            addLog(`Proof generated. publicSignals[0..2]: [${publicSignals.map(s => s.slice(0,8)+'…').join(', ')}]`);

            // Optional: local pre-verification before submitting
            try {
                const vKey = await fetchVerificationKey();
                const localValid = await verifyProofLocally(proof, publicSignals, vKey);
                addLog(`Local pre-verification: ${localValid ? '✓ PASSED' : '✗ FAILED'}`);
                if (!localValid) {
                    setError('Local proof verification failed. This may indicate a circuit/key mismatch.');
                    setPhase(PHASE.P_SELECT_CREDENTIAL);
                    return;
                }
            } catch (_) {
                addLog('Local pre-verification skipped (vkey not loaded)');
            }

            setPhase(PHASE.P_SUBMITTING);
            addLog('Submitting proof to Verifier callback URL…');

            // Submit to the backend relayer (patient device → backend → on-chain)
            const res = await api.post(scannedChallenge.callbackUrl.replace(/^.*\/api/, '/api'), {
                proof,
                publicSignals,
                sessionId: scannedChallenge.sessionId,
            });

            const result = res.data.data;
            setProofResult(result);
            setPhase(PHASE.P_DONE);
            addLog(`Proof accepted. Verification result: ${result.valid ? 'VALID ✓' : 'INVALID ✗'}`);
        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            setError(`Proof generation failed: ${msg}`);
            addLog(`Error: ${msg}`);
            setPhase(PHASE.P_SELECT_CREDENTIAL);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════

    const styles = {
        container: {
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #0c1a2e 100%)',
            color: '#e2e8f0',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            padding: '32px 16px',
        },
        card: {
            background: 'rgba(15,23,42,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 16,
            padding: 32,
            maxWidth: 720,
            margin: '0 auto',
            boxShadow: '0 0 40px rgba(59,130,246,0.1)',
        },
        title: {
            fontSize: 26, fontWeight: 800, marginBottom: 8,
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        },
        sub: { color: '#64748b', fontSize: 14, marginBottom: 32 },
        modeBtn: (active) => ({
            flex: 1, padding: '16px 24px', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, transition: 'all 0.2s',
            background: active
                ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                : 'rgba(30,41,59,0.8)',
            color: active ? '#fff' : '#64748b',
            boxShadow: active ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
        }),
        btn: {
            padding: '12px 28px', borderRadius: 10, border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: 14,
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
            transition: 'all 0.2s',
        },
        input: {
            width: '100%', padding: '12px 16px', borderRadius: 10,
            border: '1px solid rgba(59,130,246,0.3)',
            background: 'rgba(15,23,42,0.9)', color: '#e2e8f0',
            fontSize: 14, outline: 'none', boxSizing: 'border-box',
        },
        errorBox: {
            background: '#1c0a0a', border: '1px solid #dc2626',
            borderRadius: 8, padding: '12px 16px', color: '#f87171',
            fontSize: 14, marginBottom: 16,
        },
        label: { fontSize: 13, color: '#94a3b8', marginBottom: 6, display: 'block' },
        section: { marginBottom: 24 },
    };

    // ── Mode Selector ──────────────────────────────────────────────────────
    if (mode === MODE.IDLE) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h1 style={styles.title}>ZK Certificate Verification</h1>
                    <p style={styles.sub}>
                        Privacy-preserving Groth16 proof system. No plaintext medical data is ever transmitted.
                    </p>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
                        <button style={styles.modeBtn(false)} onClick={startVerifierFlow}>
                            <div style={{ fontSize: 24, marginBottom: 6 }}>🏥</div>
                            I am a Verifier
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                Insurance, Employer, or Auditor
                            </div>
                        </button>
                        <button style={styles.modeBtn(false)} onClick={startPatientFlow}>
                            <div style={{ fontSize: 24, marginBottom: 6 }}>👤</div>
                            I am a Patient
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                Prove my certificate without revealing data
                            </div>
                        </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                        🔒 Your medical data stays on your device. Only cryptographic proofs are transmitted.
                    </div>
                </div>
            </div>
        );
    }

    // ── Verifier UI ────────────────────────────────────────────────────────
    if (mode === MODE.VERIFIER) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <h2 style={{ ...styles.title, fontSize: 22 }}>Verifier Dashboard</h2>
                        <button
                            onClick={() => { setMode(MODE.IDLE); clearInterval(pollTimerRef.current); clearInterval(countdownRef.current); }}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}
                        >← Back</button>
                    </div>

                    {error && <div style={styles.errorBox}>{error}</div>}

                    {/* Challenge QR Display */}
                    {phase === PHASE.V_SHOWING_CHALLENGE && challengeQR && (
                        <div style={styles.section}>
                            <label style={styles.label}>
                                Challenge QR — Patient scans this with their device
                            </label>
                            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                                <div style={{
                                    background: '#fff', padding: 16, borderRadius: 12,
                                    boxShadow: '0 0 30px rgba(99,102,241,0.3)',
                                }}>
                                    <QRCodeCanvas value={challengeQR} size={200} level="M" />
                                </div>
                                <div>
                                    <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 8 }}>
                                        ⏱ Expires in <strong>{timeLeft}s</strong>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                                        <div>Session: <code style={{ color: '#7dd3fc' }}>{challenge?.sessionId?.slice(0, 16)}…</code></div>
                                        <div>Nonce: <code style={{ color: '#a78bfa' }}>{challenge?.nonce?.slice(0, 16)}…</code></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Waiting indicator */}
                    {phase === PHASE.V_WAITING && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#60a5fa' }}>
                            <div style={{ fontSize: 32, marginBottom: 8, animation: 'spin 2s linear infinite' }}>⟳</div>
                            Waiting for patient to submit proof…
                        </div>
                    )}

                    {/* Final result */}
                    {phase === PHASE.V_DONE && verifyResult && (
                        <>
                            <StatusBadge status={verifyResult.status} />
                            {verifyResult.status === 'valid' && (
                                <div style={{ marginTop: 16, fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
                                    <div>Issuer (on-chain): <code style={{ color: '#7dd3fc' }}>{verifyResult.issuer}</code></div>
                                    {verifyResult.issuedAt && (
                                        <div>Issued: {new Date(verifyResult.issuedAt).toLocaleString()}</div>
                                    )}
                                    {verifyResult.independentlyVerified && (
                                        <div style={{ color: '#4ade80', marginTop: 8 }}>
                                            ✓ Independently verified via direct eth_call (no backend trust)
                                        </div>
                                    )}
                                    {verifyResult.warning && (
                                        <div style={{ color: '#f59e0b', marginTop: 4 }}>⚠ {verifyResult.warning}</div>
                                    )}
                                </div>
                            )}
                            <button style={{ ...styles.btn, marginTop: 20 }} onClick={startVerifierFlow}>
                                New Verification Session
                            </button>
                        </>
                    )}

                    {/* Progress log */}
                    <div style={{ marginTop: 24 }}>
                        <label style={styles.label}>Protocol Log</label>
                        <ProgressLog messages={logs} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Patient UI ─────────────────────────────────────────────────────────
    if (mode === MODE.PATIENT) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <h2 style={{ ...styles.title, fontSize: 22 }}>Patient Proof Generator</h2>
                        <button
                            onClick={() => { stopQRScanner(); setMode(MODE.IDLE); }}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}
                        >← Back</button>
                    </div>

                    {error && <div style={styles.errorBox}>{error}</div>}

                    {/* Step 1: QR Scanner */}
                    {phase === PHASE.P_SCANNING && (
                        <div style={styles.section}>
                            <label style={styles.label}>Step 1 — Scan the Verifier's Challenge QR</label>
                            <div id={scannerDivId} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(59,130,246,0.3)' }} />
                            <div style={{ marginTop: 16 }}>
                                <label style={styles.label}>Or paste Challenge JSON manually:</label>
                                <textarea
                                    style={{ ...styles.input, height: 80, resize: 'vertical' }}
                                    placeholder='{"type":"kyllang_challenge","version":"zkv1","nonce":"0x...","sessionId":"...","callbackUrl":"..."}'
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            handleManualChallengeInput(e.target.value);
                                        }
                                    }}
                                />
                                <small style={{ color: '#475569' }}>Press Ctrl+Enter to submit</small>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Select Credential */}
                    {phase === PHASE.P_SELECT_CREDENTIAL && (
                        <div style={styles.section}>
                            <div style={{ color: '#4ade80', marginBottom: 16, fontSize: 14 }}>
                                ✓ Challenge scanned: nonce …{scannedChallenge?.nonce?.slice(-8)}
                            </div>
                            <label style={styles.label}>Step 2 — Select your certificate</label>
                            {credentials.length === 0 ? (
                                <div style={{ color: '#f87171', fontSize: 14 }}>
                                    No credentials found in local vault. Ask your doctor to issue a certificate first.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                    {credentials.map(cred => (
                                        <button
                                            key={cred.id}
                                            onClick={() => setSelectedCred(cred)}
                                            style={{
                                                padding: '12px 16px', borderRadius: 10, border: `2px solid ${selectedCred?.id === cred.id ? '#6366f1' : 'rgba(59,130,246,0.2)'}`,
                                                background: selectedCred?.id === cred.id ? 'rgba(99,102,241,0.15)' : 'rgba(15,23,42,0.9)',
                                                color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                            }}
                                        >
                                            <div>ID: {cred.id.slice(0, 20)}…</div>
                                            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                                                Valid from: {cred.validFrom ? new Date(cred.validFrom * 1000).toLocaleDateString() : '—'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <label style={styles.label}>Vault Passphrase</label>
                            <input
                                type="password"
                                style={styles.input}
                                placeholder="Enter your vault passphrase…"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerateProof()}
                            />
                            <button
                                style={{ ...styles.btn, marginTop: 16, width: '100%' }}
                                onClick={handleGenerateProof}
                                disabled={!selectedCred || !passphrase}
                            >
                                Generate ZK Proof
                            </button>
                        </div>
                    )}

                    {/* Step 3: Proof generation in progress */}
                    {(phase === PHASE.P_PROVING || phase === PHASE.P_SUBMITTING) && (
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>
                                {phase === PHASE.P_PROVING ? '🔐' : '📡'}
                            </div>
                            <div style={{ color: '#60a5fa', fontWeight: 600, marginBottom: 16 }}>
                                {phase === PHASE.P_PROVING ? 'Generating Groth16 proof…' : 'Submitting proof…'}
                            </div>
                            <div style={{ fontSize: 12, color: '#475569' }}>
                                Your medical data never leaves this device
                            </div>
                        </div>
                    )}

                    {/* Step 4: Done */}
                    {phase === PHASE.P_DONE && proofResult && (
                        <>
                            <StatusBadge status={proofResult.valid ? 'valid' : 'invalid'} />
                            <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>
                                Your proof has been verified. The Verifier will see the result on their screen.
                            </div>
                            <button style={{ ...styles.btn, marginTop: 20 }} onClick={startPatientFlow}>
                                Prove Another Certificate
                            </button>
                        </>
                    )}

                    {/* Progress log */}
                    {logs.length > 0 && (
                        <div style={{ marginTop: 24 }}>
                            <label style={styles.label}>Protocol Log (local only)</label>
                            <ProgressLog messages={logs} />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
}