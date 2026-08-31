import React, { useState } from 'react';
import { apiFetch } from '../../utils/api';

const EmergencyAccess = () => {
    const [patientId, setPatientId] = useState('');
    const [admissionVoucher, setAdmissionVoucher] = useState('');
    const [status, setStatus] = useState('IDLE');
    const [decryptedEMR, setDecryptedEMR] = useState(null);
    const [error, setError] = useState(null);

    const handleDeclareEmergency = async (e) => {
        e.preventDefault();
        setStatus('REQUESTED');
        setError(null);
        
        try {
            const response = await apiFetch('/api/emergency/break-glass', {
                method: 'POST',
                body: JSON.stringify({ patientId })
            });

            if (response.success && response.data) {
                setStatus('ACTIVE');
                setDecryptedEMR(response.data);
            } else {
                setStatus('IDLE');
                setError(response.message || 'Failed to retrieve EMR in emergency mode.');
            }
        } catch (err) {
            console.error("Emergency Access Error:", err);
            setStatus('IDLE');
            setError(err.message || 'System error connecting to emergency decryption node.');
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ color: '#d9534f' }}>Break-Glass Emergency Decryption</h1>
            <p>Authorized ER Personnel Only. All access is cryptographically audited.</p>
            
            {error && (
                <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                    <strong>Error: </strong> {error}
                </div>
            )}

            {status === 'IDLE' && (
                <form onSubmit={handleDeclareEmergency}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label>Patient ID (MongoDB Object ID or Public Key Hash)</label><br />
                        <input 
                            type="text" 
                            required 
                            value={patientId} 
                            onChange={(e) => setPatientId(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }} 
                        />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label>Admission Triage Voucher Hash (Optional)</label><br />
                        <input 
                            type="text" 
                            value={admissionVoucher} 
                            onChange={(e) => setAdmissionVoucher(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }} 
                        />
                    </div>
                    <button type="submit" style={{ backgroundColor: '#d9534f', color: 'white', padding: '0.75rem 1.5rem', border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        🚨 Declare Emergency & Bypass Auth
                    </button>
                </form>
            )}

            {status === 'REQUESTED' && (
                <div style={{ padding: '2rem', border: '1px solid #ccc', marginTop: '2rem', textAlign: 'center', borderRadius: '4px' }}>
                    <h3 style={{ color: '#d9534f' }}>Status: INITIATING BREAK-GLASS</h3>
                    <p>Bypassing access controls and writing to immutable audit log...</p>
                </div>
            )}

            {status === 'ACTIVE' && decryptedEMR && (
                <div style={{ padding: '2rem', border: '2px solid red', marginTop: '2rem', backgroundColor: '#fff5f5', borderRadius: '4px' }}>
                    <h2 style={{ color: 'red', marginTop: 0 }}>⚠️ LIVE EMR STREAM - DO NOT CACHE ⚠️</h2>
                    <p><strong>Patient Name:</strong> {decryptedEMR.patient?.name || 'Unknown'}</p>
                    <p><strong>Patient Email:</strong> {decryptedEMR.patient?.email || 'Unknown'}</p>
                    <p><strong>Blood Type:</strong> {decryptedEMR.bloodGroup || 'Unknown'}</p>
                    
                    <div style={{ marginTop: '1rem' }}>
                        <strong>Allergies:</strong>
                        <ul>
                            {decryptedEMR.allergies && decryptedEMR.allergies.length > 0 
                                ? decryptedEMR.allergies.map((a, i) => <li key={i}>{a}</li>) 
                                : <li>None Recorded</li>}
                        </ul>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <strong>Chronic Conditions:</strong>
                        <ul>
                            {decryptedEMR.chronicConditions && decryptedEMR.chronicConditions.length > 0 
                                ? decryptedEMR.chronicConditions.map((c, i) => <li key={i}>{c}</li>) 
                                : <li>None Recorded</li>}
                        </ul>
                    </div>
                    
                    <button onClick={() => {
                        setStatus('IDLE');
                        setDecryptedEMR(null);
                        setPatientId('');
                        setAdmissionVoucher('');
                    }} style={{ marginTop: '2rem', backgroundColor: '#424242', color: 'white', padding: '0.5rem 1rem', border: 'none', cursor: 'pointer', borderRadius: '4px', width: '100%' }}>
                        Close Session & Wipe Memory
                    </button>
                </div>
            )}
        </div>
    );
};

export default EmergencyAccess;
