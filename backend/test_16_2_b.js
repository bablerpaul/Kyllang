const express = require('express');
const request = require('supertest');
const helmet = require('helmet');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { validateMagicBytes } = require('./src/modules/secure-storage/utils/magicBytes');

// Setup mock app
const app = express();

// Apply exactly the Helmet config from index.js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            connectSrc: ["'self'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: false, // Testing non-prod
    referrerPolicy: { policy: 'no-referrer' }
}));

const upload = multer({ dest: 'temp_test/' });

const validateFileContent = async (req, res, next) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    try {
        const isValid = await validateMagicBytes(req.file.path, req.file.mimetype);
        if (!isValid) {
            fs.promises.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ success: false, message: 'Invalid file content signature. File may be tampered or malicious.' });
        }
        next();
    } catch (error) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(500).json({ success: false, message: 'File validation failed.' });
    }
};

app.post('/api/upload', upload.single('file'), validateFileContent, (req, res) => {
    fs.promises.unlink(req.file.path).catch(() => {});
    res.json({ success: true, message: 'File accepted' });
});

app.get('/api/view', (req, res) => {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename=test.jpg');
    res.send('mock image content');
});

async function runTests() {
    if (!fs.existsSync('temp_test')) {
        fs.mkdirSync('temp_test');
    }

    console.log("=== 1. SECURITY HEADERS TEST ===");
    let res = await request(app).get('/api/view');
    console.log("[GET /api/view] X-Content-Type-Options:", res.headers['x-content-type-options']);
    console.log("[GET /api/view] Content-Security-Policy:", !!res.headers['content-security-policy'] ? 'PRESENT' : 'MISSING');
    console.log("[GET /api/view] Referrer-Policy:", res.headers['referrer-policy']);
    console.log("[GET /api/view] Strict-Transport-Security:", res.headers['strict-transport-security'] || 'MISSING (as expected in dev)');
    console.log("[GET /api/view] Content-Disposition:", res.headers['content-disposition']);

    console.log("\n=== 2. FILE UPLOAD VALIDATION TESTS ===");

    // Create mock files
    const htmlFile = path.join(__dirname, 'temp_test', 'malicious.html');
    const txtFile = path.join(__dirname, 'temp_test', 'test.txt');
    const validPng = path.join(__dirname, 'temp_test', 'valid.png');
    
    fs.writeFileSync(htmlFile, '<script>alert(1)</script>');
    fs.writeFileSync(txtFile, 'just some text');
    
    // Create a real PNG signature
    const pngBuffer = Buffer.alloc(132);
    pngBuffer[0] = 0x89; pngBuffer[1] = 0x50; pngBuffer[2] = 0x4E; pngBuffer[3] = 0x47;
    pngBuffer[4] = 0x0D; pngBuffer[5] = 0x0A; pngBuffer[6] = 0x1A; pngBuffer[7] = 0x0A;
    fs.writeFileSync(validPng, pngBuffer);

    // Test 1: HTML file spoofed as JPEG
    res = await request(app)
        .post('/api/upload')
        .attach('file', htmlFile, { contentType: 'image/jpeg', filename: 'malicious.jpg' });
    console.log("[UPLOAD HTML as JPEG] Status:", res.status, res.body.message);

    // Test 2: HTML file spoofed as PDF
    res = await request(app)
        .post('/api/upload')
        .attach('file', htmlFile, { contentType: 'application/pdf', filename: 'malicious.pdf' });
    console.log("[UPLOAD HTML as PDF] Status:", res.status, res.body.message);

    // Test 3: Text file spoofed as PNG
    res = await request(app)
        .post('/api/upload')
        .attach('file', txtFile, { contentType: 'image/png', filename: 'test.png' });
    console.log("[UPLOAD TXT as PNG] Status:", res.status, res.body.message);

    // Test 4: Genuine PNG
    res = await request(app)
        .post('/api/upload')
        .attach('file', validPng, { contentType: 'image/png', filename: 'valid.png' });
    console.log("[UPLOAD Genuine PNG] Status:", res.status, res.body.message);

    // Cleanup
    if (fs.existsSync(htmlFile)) fs.unlinkSync(htmlFile);
    if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
    if (fs.existsSync(validPng)) fs.unlinkSync(validPng);
    if (fs.existsSync('temp_test')) fs.rmdirSync('temp_test');

    process.exit(0);
}

runTests();
