const http = require('http');

const payload = JSON.stringify({
    hash: '86aecc67c59a8b4fd5b34c768d320245e38c8b133c38cf4b9de0e3907b720b62',
    data: {
        patientId: '6999652f33759a66de05d0c1',
        diagnosis: 'of ourse',
        validFrom: '2026-02-25',
        validUntil: '2026-03-04'
    }
});

const req = http.request('http://localhost:5000/api/certificates/verify', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    let rawData = '';
    res.on('data', chunk => { rawData += chunk; });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${rawData}`);
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.write(payload);
req.end();
