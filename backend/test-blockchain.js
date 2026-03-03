const http = require('http');

async function testAnchor() {
    console.log("1. Logging in as Admin...");

    // Login as admin
    const loginData = JSON.stringify({ email: 'admin@hospital.com', password: 'password123' });
    const loginOptions = {
        hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
    };

    const token = await new Promise((resolve, reject) => {
        const req = http.request(loginOptions, res => {
            let responseData = '';
            res.on('data', d => responseData += d);
            res.on('end', () => {
                const parsed = JSON.parse(responseData);
                if (parsed.token) resolve(parsed.token);
                else reject("Login failed: " + responseData);
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    console.log("2. Anchoring logs to Blockchain via app.js...");

    // Trigger anchor logs
    const anchorOptions = {
        hostname: 'localhost', port: 5000, path: '/api/admin/anchor-logs', method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    };

    const result = await new Promise((resolve, reject) => {
        const req = http.request(anchorOptions, res => {
            let responseData = '';
            res.on('data', d => responseData += d);
            res.on('end', () => resolve(responseData));
        });
        req.on('error', reject);
        req.end();
    });

    console.log("Result:", result);
}

testAnchor().catch(console.error);
