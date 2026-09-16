const mongoose = require('mongoose');
const { ethers } = require('ethers');

// Mock models
require.cache[require.resolve('./models/Consent.js')] = {
    exports: {
        create: async (data) => {
            data._id = new mongoose.Types.ObjectId();
            data.save = async () => {};
            return data;
        },
        findOne: async (q) => {
            if (q._id === 'mock_id') {
                return {
                    _id: 'mock_id',
                    patient: q.patient,
                    status: 'active',
                    save: async function() { this.saved = true; }
                };
            }
            return null;
        }
    }
};

require.cache[require.resolve('./models/AuditLog.js')] = {
    exports: {
        create: async (data) => { console.log("AuditLog Created:", data.action); }
    }
};

process.env.TEST_MODE = 'true';
const consentController = require('./controllers/consentController');

async function runTests() {
    console.log("Testing grantConsent...");
    
    let req = {
        user: { _id: new mongoose.Types.ObjectId() },
        body: {
            grantedTo: new mongoose.Types.ObjectId(),
            scope: 'RECORD_TYPE',
            recordType: 'LabReport',
            purpose: 'Laboratory Analysis',
            durationDays: 7
        }
    };
    
    let res = {
        status: function(code) { this.code = code; return this; },
        json: function(data) { console.log(`Response [${this.code}]:`, data.message); return data; }
    };
    
    await consentController.grantConsent(req, res, (err) => console.error(err));
    
    console.log("\nTesting revokeConsent...");
    req.params = { consentId: 'mock_id' };
    await consentController.revokeConsent(req, res, (err) => console.error(err));

    console.log("\nAll mock tests completed successfully.");
}

runTests();
