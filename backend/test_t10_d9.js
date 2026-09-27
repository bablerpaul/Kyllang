const mongoose = require('mongoose');
const { InsuranceClaim, Consent, Patient, User, AuditLog } = require('./src/models');
const { approveClaim } = require('./src/modules/insurance/insuranceController');

mongoose.connect('mongodb://127.0.0.1:27017/kyllang').then(async () => {
    try {
        console.log('--- STARTING APPROVAL TESTS ---');

        const officerUser = await User.create({ name: 'Test Officer', email: 'officer' + Date.now() + '@test.com', role: 'insurance_officer', password: 'hashedpassword' });
        const officerUser2 = await User.create({ name: 'Test Officer 2', email: 'officer2' + Date.now() + '@test.com', role: 'insurance_officer', password: 'hashedpassword' });
        const docUser = await User.create({ name: 'Test Doc', email: 'doc' + Date.now() + '@test.com', role: 'doctor', password: 'hashedpassword' });

        const patUser = await User.create({ name: 'Test Pat', email: 'pat' + Date.now() + '@test.com', role: 'general_user', password: 'hashedpassword' });
        const patient = await Patient.create({ user: patUser._id, dateOfBirth: new Date() });
        const patUser2 = await User.create({ name: 'Test Pat 2', email: 'pat2' + Date.now() + '@test.com', role: 'general_user', password: 'hashedpassword' });
        const patient2 = await Patient.create({ user: patUser2._id, dateOfBirth: new Date() });

        await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });

        let runCount = 0;
        const createClaim = async () => {
            return await InsuranceClaim.create({
                patient: patient._id,
                provider: 'Test',
                policyNumber: '123',
                claimAmount: 100,
                status: 'submitted',
                blockchainHash: 'hash_' + (runCount++)
            });
        };

        const runApproval = async (name, claimId, amount, expectedStatus, expectedMessageRegex, userOverride) => {
            const req = {
                params: { id: claimId },
                body: {},
                user: userOverride || officerUser,
                originalUrl: '/test',
                ip: '127.0.0.1'
            };
            if (amount !== undefined) req.body.approvedAmount = amount;
            
            let jsonCalled = false;
            let resStatus = 200;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => {
                    jsonCalled = true;
                    if (expectedStatus !== resStatus) {
                        console.error(`Test [${name}] FAILED: expected ${expectedStatus}, got ${resStatus}. Message: ${data.message}`);
                    } else if (expectedMessageRegex && !expectedMessageRegex.test(data.message)) {
                        console.error(`Test [${name}] FAILED: message didn't match. Got: ${data.message}`);
                    } else {
                        console.log(`Test [${name}]: SUCCESS (${resStatus})`);
                    }
                }
            };

            await approveClaim(req, res, (err) => {
                console.error(`Test [${name}] NEXT CALLED with err:`, err);
            });
            return resStatus;
        };

        const checkUnchanged = async (name, claimId, originalClaim) => {
            const afterClaim = await InsuranceClaim.findById(claimId).lean();
            if (afterClaim.status !== 'submitted' || afterClaim.approvedAmount !== 0) {
                console.error(`Test [${name}] FAILED: claim was mutated!`);
            }
            const audits = await AuditLog.find({ action: 'UPDATED', 'details.resourceId': claimId }).lean();
            if (audits.length > 0) {
                console.error(`Test [${name}] FAILED: audit log created!`);
            }
        };

        // --- AUTHORIZATION TESTS ---
        const authClaim = await createClaim();
        // 1. officer + insurance_claims (valid amount) - will do later
        // 3. no consent
        const noConsentClaim = await createClaim();
        await Consent.deleteMany({ patient: patient._id });
        await runApproval('3. no consent', noConsentClaim._id, 100, 403);
        
        // Restore consent
        await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });
        
        // 4. expired
        const expiredClaim = await createClaim();
        await Consent.deleteMany({ patient: patient._id });
        await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() - 100000) });
        await runApproval('4. expired consent', expiredClaim._id, 100, 403);
        
        // Restore consent
        await Consent.deleteMany({ patient: patient._id });
        await Consent.create({ patient: patient._id, grantedTo: officerUser._id, grantedToRole: 'insurance', scope: 'insurance_claims', status: 'active', expiresAt: new Date(Date.now() + 100000) });

        // 6. wrong officer
        await runApproval('6. wrong officer', authClaim._id, 100, 403, null, officerUser2);

        // 7. wrong patient
        const otherPatClaim = await InsuranceClaim.create({ patient: patient2._id, provider: 'Test', policyNumber: '123', claimAmount: 100, status: 'submitted' });
        await runApproval('7. wrong patient', otherPatClaim._id, 100, 403);

        // 10. doctor (should be denied because not in allowed roles, but role middleware usually catches it. In this test, the controller checks it anyway).
        await runApproval('10. doctor', authClaim._id, 100, 403, null, docUser);

        // --- AMOUNT VALIDATION (INVALID) ---
        const invalidValues = [
            { name: 'null', val: null },
            { name: 'empty string', val: "" },
            { name: 'abc', val: "abc" },
            { name: 'NaN string', val: "NaN" },
            { name: 'Infinity string', val: "Infinity" },
            { name: 'NaN', val: NaN },
            { name: 'Infinity', val: Infinity },
            { name: 'negative number', val: -50 },
            { name: 'negative string', val: "-50" },
            { name: 'object', val: { amount: 100 } },
            { name: 'array', val: [100] },
            { name: 'boolean true', val: true },
            { name: 'boolean false', val: false }
        ];

        for (const t of invalidValues) {
            const claim = await createClaim();
            await runApproval(`Invalid: ${t.name}`, claim._id, t.val, 400);
            await checkUnchanged(`Invalid: ${t.name}`, claim._id, claim);
            await InsuranceClaim.findByIdAndDelete(claim._id);
        }

        // --- AMOUNT VALIDATION (VALID) ---
        const validValues = [
            { name: 'normal positive', val: 50 },
            { name: 'decimal', val: 50.5 },
            { name: 'zero', val: 0 },
            { name: 'missing (defaults to claimAmount)', val: undefined }
        ];

        for (const t of validValues) {
            const claim = await createClaim();
            await runApproval(`Valid: ${t.name}`, claim._id, t.val, 200);
            const after = await InsuranceClaim.findById(claim._id).lean();
            if (after.status !== 'approved') console.error(`Test [Valid: ${t.name}] FAILED: status not approved`);
            const expectedAmount = t.val === undefined ? claim.claimAmount : t.val;
            if (after.approvedAmount !== expectedAmount) console.error(`Test [Valid: ${t.name}] FAILED: amount ${after.approvedAmount} != ${expectedAmount}`);
            
            const audits = await AuditLog.find({ action: 'UPDATED', 'details.resourceId': claim._id }).lean();
            if (audits.length !== 1) console.error(`Test [Valid: ${t.name}] FAILED: audit log missing or multiple`);
            
            await InsuranceClaim.findByIdAndDelete(claim._id);
        }

        // Cleanup
        await User.deleteMany({ _id: { $in: [officerUser._id, officerUser2._id, patUser._id, patUser2._id, docUser._id] } });
        await Patient.deleteMany({ _id: { $in: [patient._id, patient2._id] } });
        await InsuranceClaim.deleteMany({ provider: 'Test', policyNumber: '123' });
        await Consent.deleteMany({ patient: { $in: [patient._id, patient2._id] } });

        console.log('--- DONE ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
