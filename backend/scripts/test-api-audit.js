const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const app = require('../index');

const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const MedicalRecord = require('../models/MedicalRecord');
const Consent = require('../models/Consent');
const Prescription = require('../models/Prescription');
const LabReport = require('../models/LabReport');
const jwt = require('jsonwebtoken');

const generateAccessToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Clear state
    await Consent.deleteMany({});
    await User.deleteMany({ email: { $in: ['audit-doc1@test.com', 'audit-doc2@test.com', 'audit-pat1@test.com', 'audit-pat2@test.com'] } });
    await MedicalRecord.deleteMany({ diagnosis: { $regex: 'Audit ' } });

    // Users
    const doc1 = await User.create({ name: 'Doc 1', email: 'audit-doc1@test.com', password: 'password', role: 'doctor' });
    const doc2 = await User.create({ name: 'Doc 2', email: 'audit-doc2@test.com', password: 'password', role: 'doctor' });
    const pat1 = await User.create({ name: 'Pat 1', email: 'audit-pat1@test.com', password: 'password', role: 'general_user' });
    const pat2 = await User.create({ name: 'Pat 2', email: 'audit-pat2@test.com', password: 'password', role: 'general_user' });

    // Profiles
    const L1 = 'L1-' + Date.now();
    const L2 = 'L2-' + Date.now();
    const d1 = await Doctor.create({ user: doc1._id, specialty: 'Cardiology', licenseNumber: L1, department: 'Cardiology' });
    const d2 = await Doctor.create({ user: doc2._id, specialty: 'Neurology', licenseNumber: L2, department: 'Neurology' });
    const p1 = await Patient.create({ user: pat1._id, dateOfBirth: '1990-01-01', gender: 'Male', assignedDoctors: [d1._id] });
    const p2 = await Patient.create({ user: pat2._id, dateOfBirth: '1990-01-01', gender: 'Male' });

    // Record
    const r1 = await MedicalRecord.create({ patient: p1._id, doctor: doc1._id, diagnosis: 'Audit Diagnosis Pat 1' });

    const doc1Token = generateAccessToken(doc1._id);
    const doc2Token = generateAccessToken(doc2._id);
    const pat1Token = generateAccessToken(pat1._id);
    const pat2Token = generateAccessToken(pat2._id);

    console.log('[+] Setup Complete');

    // Wait for the app to start listening
    const app = require('../index');
    const port = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            resolve(server.address().port);
        });
    });
    const baseUrl = `http://127.0.0.1:${port}`;

    const fetchJson = async (url, options = {}) => {
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    const results = {};

    // T1: Unauthenticated logout request.
    res = await fetchJson(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    results['T1'] = { status: res.status, success: res.body.success };

    // Set up a user and login to get cookies for T2 & T3
    const loginRawRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'audit-pat1@test.com', password: 'password' })
    });
    
    // fetch's headers.get('set-cookie') works, but sometimes there are multiple set-cookie headers
    // we can iterate over them or just grab the raw header array (for node-fetch or native node fetch)
    const setCookieHeaders = loginRawRes.headers.getSetCookie ? loginRawRes.headers.getSetCookie() : [loginRawRes.headers.get('set-cookie')];
    const cookies = setCookieHeaders.join('; ');
    const loginBody = await loginRawRes.json();
    const token = loginBody.data.token;

    // T2: Legitimate authenticated logout (simulating same-site browser sending cookies)
    res = await fetchJson(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': cookies } // Simulates SameSite=Strict allowing the cookie
    });
    results['T2'] = { status: res.status, success: res.body.success };

    // T3: After logout, verify authentication state is no longer accepted 
    // (Using the old token against a protected route to verify token/session invalidation behavior)
    // Note: The API uses stateless JWTs for `protect`, so the accessToken might still work until expiry, 
    // but the refreshToken should be revoked. Let's check refresh token revocation.
    // We'll attempt to use the refresh route with the old cookie.
    res = await fetchJson(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Cookie': cookies }
    });
    results['T3_RefreshTokenRevoked'] = { status: res.status };

    // T4: Determine whether a cross-site request can cause an authenticated logout.
    // Since cookies are strictly `SameSite: strict`, a cross-site request will NOT send the `Cookie` header.
    // Thus, the backend sees an unauthenticated request.
    // We simulate this by omitting the Cookie header.
    res = await fetchJson(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        // headers: { 'Cookie': cookies } // Browser drops this cross-site
    });
    results['T4_CrossSiteLogout'] = { status: res.status, success: res.body.success };

    // Verify 15.7-B-1 remains intact
    res = await fetchJson(`${baseUrl}/api/emr/records/${p1._id}`, {
        headers: { 'Authorization': `Bearer ${doc2Token}` }
    });
    results['T5_Regression_B1'] = { status: res.status };

    console.log(JSON.stringify(results, null, 2));

    // Cleanup
    await Consent.deleteMany({});
    await User.deleteMany({ email: { $in: ['audit-doc1@test.com', 'audit-doc2@test.com', 'audit-pat1@test.com', 'audit-pat2@test.com', 'audit-admin@test.com'] } });
    await MedicalRecord.deleteMany({ diagnosis: { $regex: 'Audit ' } });
    await Patient.deleteMany({ _id: { $in: [p1._id, p2._id] } });
    await Doctor.deleteMany({ _id: { $in: [d1._id, d2._id] } });
    await Prescription.deleteMany({ patient: { $in: [p1._id, p2._id] } });
    await LabReport.deleteMany({ patient: p1._id });

    process.exit(0);
}

main().catch(console.error);
