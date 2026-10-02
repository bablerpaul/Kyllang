const { createCertificate } = require('./controllers/certificateController');

async function runTests() {
    let statusValue;
    let jsonValue;
    let errorPassed;

    const mockRes = {
        status: (s) => { statusValue = s; return mockRes; },
        json: (j) => { jsonValue = j; return mockRes; }
    };
    const mockNext = (err) => { errorPassed = err; };

    function reset() {
        statusValue = null;
        jsonValue = null;
        errorPassed = null;
    }

    console.log("--- Test 1: Missing certificateType ---");
    reset();
    await createCertificate({ body: {} }, mockRes, mockNext);
    console.log("Status:", statusValue);
    console.log("Response:", jsonValue);

    console.log("\n--- Test 2: Invalid certificateType ---");
    reset();
    await createCertificate({ body: { certificateType: 'invalid_type' } }, mockRes, mockNext);
    console.log("Status:", statusValue);
    console.log("Response:", jsonValue);

    console.log("\n--- Test 3: vaccine ---");
    reset();
    await createCertificate({ 
        body: { certificateType: 'vaccine' },
        user: { _id: 'mockUserId', role: 'doctor' }
    }, mockRes, mockNext);
    // Since patientId is missing, it should hit the SECOND validation block
    console.log("Status:", statusValue);
    console.log("Response:", jsonValue);

    console.log("\n--- Test 4: age_verification ---");
    reset();
    await createCertificate({ 
        body: { certificateType: 'age_verification' },
        user: { _id: 'mockUserId', role: 'doctor' }
    }, mockRes, mockNext);
    console.log("Status:", statusValue);
    console.log("Response:", jsonValue);

    console.log("\n--- Test 5: general ---");
    reset();
    await createCertificate({ 
        body: { certificateType: 'general' },
        user: { _id: 'mockUserId', role: 'doctor' }
    }, mockRes, mockNext);
    console.log("Status:", statusValue);
    console.log("Response:", jsonValue);
}

runTests().catch(console.error);
