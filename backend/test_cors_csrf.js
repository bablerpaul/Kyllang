const express = require('express');
const cors = require('cors');
const request = require('supertest');
const { csrfMiddleware, getAllowedOrigins } = require('./middlewares/csrfMiddleware');

const app = express();
app.use(express.json());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigins = getAllowedOrigins();
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error(`The CORS policy for this site does not allow access from the specified Origin: ${origin}`), false);
        }
        return callback(null, true);
    },
    credentials: true,
}));

app.use(csrfMiddleware);

app.post('/api/test', (req, res) => {
    res.json({ success: true, message: 'Test POST passed' });
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'Test GET passed' });
});

app.use((err, req, res, next) => {
    if (err.message && err.message.includes('CORS policy')) {
        res.status(500).json({ error: 'CORS Error' });
    } else {
        next(err);
    }
});

async function runTests() {
    let allPassed = true;

    console.log('Testing GET (safe method) with missing origin...');
    let res = await request(app).get('/api/test');
    if (res.status === 200) {
        console.log('PASS: GET allowed without Origin');
    } else {
        console.error('FAIL: GET without origin', res.status, res.body);
        allPassed = false;
    }

    console.log('Testing GET (safe method) with untrusted origin...');
    res = await request(app).get('/api/test').set('Origin', 'http://evil.com');
    if (res.status === 500 && res.body.error === 'CORS Error') {
        console.log('PASS: GET rejected by CORS');
    } else {
        console.error('FAIL: GET with evil origin', res.status, res.body);
        allPassed = false;
    }

    console.log('Testing POST with missing origin/referer...');
    res = await request(app).post('/api/test');
    if (res.status === 403 && res.body.message.includes('Missing Origin or Referer')) {
        console.log('PASS: POST blocked by CSRF middleware');
    } else {
        console.error('FAIL: POST without origin', res.status, res.body);
        allPassed = false;
    }

    console.log('Testing POST with trusted origin...');
    res = await request(app).post('/api/test').set('Origin', 'http://localhost:5173');
    if (res.status === 200) {
        console.log('PASS: POST allowed from trusted origin');
    } else {
        console.error('FAIL: POST from trusted origin', res.status, res.body);
        allPassed = false;
    }

    console.log('Testing POST with trusted Referer...');
    res = await request(app).post('/api/test').set('Referer', 'http://localhost:5173/dashboard');
    if (res.status === 200) {
        console.log('PASS: POST allowed from trusted referer');
    } else {
        console.error('FAIL: POST from trusted referer', res.status, res.body);
        allPassed = false;
    }

    console.log('Testing POST with evil origin...');
    res = await request(app).post('/api/test').set('Origin', 'http://evil.com');
    if (res.status === 500 && res.body.error === 'CORS Error') {
        console.log('PASS: POST blocked by CORS');
    } else {
        console.error('FAIL: POST from evil origin', res.status, res.body);
        allPassed = false;
    }

    if (allPassed) {
        console.log('\\nALL TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    } else {
        console.error('\\nSOME TESTS FAILED!');
        process.exit(1);
    }
}

runTests();
