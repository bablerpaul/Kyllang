const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./index');

async function testStaticFiles() {
    console.log('--- STARTING STATIC ROUTE REMOVAL TEST ---');

    const tempDir = path.join(__dirname, 'uploads', 'temp');
    const fallbackDir = path.join(__dirname, 'uploads', 'fallback-storage');
    
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });

    const tempFile = path.join(tempDir, 'synthetic-temp.txt');
    const fallbackFile = path.join(fallbackDir, 'mock_ipfs_cid_synth');

    fs.writeFileSync(tempFile, 'UNENCRYPTED_TEMP_DATA');
    fs.writeFileSync(fallbackFile, 'ENCRYPTED_FALLBACK_DATA');

    const server = http.createServer(app);
    server.listen(5098, async () => {
        console.log('Test Server started on 5098');

        async function fetchPath(urlPath) {
            return new Promise((resolve) => {
                http.get(`http://localhost:5098${urlPath}`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, data }));
                }).on('error', (e) => resolve({ status: 'ERROR', error: e.message }));
            });
        }

        console.log('\n[TEST] Unauthenticated access to /uploads/temp/synthetic-temp.txt');
        let res = await fetchPath('/uploads/temp/synthetic-temp.txt');
        console.log('Status:', res.status, res.status === 404 ? '(PASS)' : '(FAIL - Route Still Open!)');

        console.log('\n[TEST] Unauthenticated access to /uploads/fallback-storage/mock_ipfs_cid_synth');
        res = await fetchPath('/uploads/fallback-storage/mock_ipfs_cid_synth');
        console.log('Status:', res.status, res.status === 404 ? '(PASS)' : '(FAIL - Route Still Open!)');

        console.log('\n[TEST] Traversal /uploads/../package.json');
        res = await fetchPath('/uploads/../package.json');
        console.log('Status:', res.status, res.status === 404 || res.status === 400 ? '(PASS)' : '(FAIL)');

        console.log('\n[TEST] Traversal /uploads/temp/../../package.json');
        res = await fetchPath('/uploads/temp/../../package.json');
        console.log('Status:', res.status, res.status === 404 || res.status === 400 ? '(PASS)' : '(FAIL)');

        // Cleanup
        fs.unlinkSync(tempFile);
        fs.unlinkSync(fallbackFile);
        
        server.close();
        process.exit(0);
    });
}
testStaticFiles().catch(e => { console.error(e); process.exit(1); });
