const express = require('express');
const request = require('supertest');
const cors = require('cors');
const { csrfMiddleware, getAllowedOrigins } = require('./middlewares/csrfMiddleware');

// Mock App Setup (matching backend/index.js)
const app = express();
app.use(express.json());

// CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigins = getAllowedOrigins();
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
}));

// CSRF
app.use(csrfMiddleware);

// Mock route
app.post('/api/test', (req, res) => res.json({ success: true }));
app.get('/api/test', (req, res) => res.json({ success: true }));
app.patch('/api/test', (req, res) => res.json({ success: true }));

// Error handler
app.use((err, req, res, next) => {
    if (err.message && err.message.includes('CORS policy')) {
        res.status(500).json({ error: 'CORS Error' });
    } else {
        next(err);
    }
});

async function runTests() {
    console.log("=== 1. CORS TESTS ===");
    
    // a. Trusted Origin
    let res = await request(app).options('/api/test').set('Origin', 'http://localhost:5173');
    console.log("[OPTIONS Trusted Origin] Status:", res.status);
    console.log("[OPTIONS Trusted Origin] ACAO:", res.headers['access-control-allow-origin']);
    console.log("[OPTIONS Trusted Origin] ACAC:", res.headers['access-control-allow-credentials']);

    res = await request(app).get('/api/test').set('Origin', 'http://localhost:5173');
    console.log("[GET Trusted Origin] Status:", res.status);
    console.log("[GET Trusted Origin] ACAO:", res.headers['access-control-allow-origin']);
    
    // b. Untrusted Origin
    res = await request(app).options('/api/test').set('Origin', 'http://evil.com');
    console.log("[OPTIONS Untrusted Origin] Status:", res.status);
    console.log("[OPTIONS Untrusted Origin] ACAO:", res.headers['access-control-allow-origin']);
    
    res = await request(app).get('/api/test').set('Origin', 'http://evil.com');
    console.log("[GET Untrusted Origin] Status:", res.status);
    console.log("[GET Untrusted Origin] Body:", res.body);
    
    // c. Missing Origin (CORS level)
    res = await request(app).get('/api/test');
    console.log("[GET Missing Origin] Status:", res.status);

    console.log("\\n=== 2. CSRF MIDDLEWARE TESTS ===");
    
    // a. Trusted Origin + state-changing
    res = await request(app).post('/api/test').set('Origin', 'http://localhost:5173');
    console.log("[POST Trusted Origin] Status:", res.status);
    
    // b. Untrusted Origin + state-changing
    res = await request(app).post('/api/test').set('Origin', 'http://evil.com');
    console.log("[POST Untrusted Origin] Status:", res.status);
    
    // c. Trusted Referer
    res = await request(app).post('/api/test').set('Referer', 'http://localhost:5173/path');
    console.log("[POST Trusted Referer] Status:", res.status);
    
    // d. Untrusted Referer
    res = await request(app).post('/api/test').set('Referer', 'http://evil.com/path');
    console.log("[POST Untrusted Referer] Status:", res.status, res.body.message);
    
    // e. Missing Origin and missing Referer
    res = await request(app).post('/api/test');
    console.log("[POST Missing Both] Status:", res.status, res.body.message);
    
    // f. Malformed Origin (will be treated as not matching allowlist)
    res = await request(app).post('/api/test').set('Origin', 'htp://bad-origin');
    console.log("[POST Malformed Origin] Status:", res.status);
    
    // g. Malformed Referer (will fallback to missing or untrusted)
    res = await request(app).post('/api/test').set('Referer', 'htp://bad-referer');
    console.log("[POST Malformed Referer] Status:", res.status, res.body.message);

    console.log("\\n=== 3. HTTP METHOD COVERAGE ===");
    res = await request(app).patch('/api/test').set('Origin', 'http://evil.com');
    console.log("[PATCH Untrusted Origin] Status:", res.status);
    
    process.exit(0);
}

runTests();
