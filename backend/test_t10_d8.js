const mongoose = require('mongoose');
const { InsuranceClaim, Consent, Patient, User } = require('./src/models');
const { authorizeClaimDocumentUpload } = require('./src/modules/insurance/insuranceController');

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    try {
        console.log('--- STARTING CONTROLLED TESTS ---');

        const officerUser = await User.create({ name: 'Test Officer', email: 'officer' + Date.now() + '@test.com', role: 'insurance_officer', password: 'hashedpassword' });
        const officerUser2 = await User.create({ name: 'Test Officer 2', email: 'officer2' + Date.now() + '@test.com', role: 'insurance_officer', password: 'hashedpassword' });
        
        const patUser = await User.create({ name: 'Test Pat', email: 'pat' + Date.now() + '@test.com', role: 'general_user', password: 'hashedpassword' });
        const patient = await Patient.create({ user: patUser._id, dateOfBirth: new Date() });

        const patUser2 = await User.create({ name: 'Test Pat 2', email: 'pat2' + Date.now() + '@test.com', role: 'general_user', password: 'hashedpassword' });
        const patient2 = await Patient.create({ user: patUser2._id, dateOfBirth: new Date() });

        const claim = await InsuranceClaim.create({
            patient: patient._id,
            provider: 'Test',
            policyNumber: '123',
            claimAmount: 100,
            status: 'submitted'
        });

        const docUser = await User.create({ name: 'Test Doc', email: 'doc' + Date.now() + '@test.com', role: 'doctor', password: 'hashedpassword' });

        const runTest = async (name, user, claimId, setup) => {
            if (setup) await setup();
            let nextCalled = false;
            let statusCode = null;
            const req = { params: { id: claimId }, user: user };
            const res = {
                status: (code) => { statusCode = code; return { json: () => {} }; }
            };
            await authorizeClaimDocumentUpload(req, res, (err) => {
                if (err) statusCode = 500;
                else nextCalled = true;
            });
            console.log(`Test [${name}]:`, statusCode || (nextCalled ? 'SUCCESS' : 'ERROR'));
        };

        const cleanupConsents = async () => await Consent.deleteMany({ patient: { $in: [patient._id, patient2._id] } });

        // 1. insurance_claims
        await runTest('1. officer + insurance_claims', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 2. full_access
        await runTest('2. officer + full_access', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'full_access', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 3. no consent
        await runTest('3. no consent', officerUser, claim._id, async () => {
            await cleanupConsents();
        });

        // 4. expired
        await runTest('4. expired', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() - 100000) });
        });

        // 5. revoked
        await runTest('5. revoked', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'revoked', expiresAt: new Date(Date.now() + 100000) });
        });

        // 6. wrong officer
        await runTest('6. wrong officer', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser2._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 7. different patient's consent
        await runTest('7. different patient', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient2._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 8. wrong scope
        await runTest('8. wrong scope (lab_reports)', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'lab_reports', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 9. name-only legacy consent (no grantedTo or wrong role)
        await runTest('9. name-only legacy', officerUser, claim._id, async () => {
            await cleanupConsents();
            await Consent.create({ patient: patient._id, grantedToRole: 'doctor', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        });

        // 10. doctor (should be 403 without consent)
        await runTest('10. doctor (no consent)', docUser, claim._id, async () => await cleanupConsents());
        
        // 12. nonexistent claim
        await runTest('12. nonexistent claim', officerUser, new mongoose.Types.ObjectId(), async () => await cleanupConsents());

        // Cleanup
        await User.deleteMany({ _id: { $in: [officerUser._id, officerUser2._id, patUser._id, patUser2._id, docUser._id] } });
        await Patient.deleteMany({ _id: { $in: [patient._id, patient2._id] } });
        await InsuranceClaim.findByIdAndDelete(claim._id);
        await cleanupConsents();

        console.log('--- DONE ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
