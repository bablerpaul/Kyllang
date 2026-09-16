const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { encryptFileStream } = require('./src/utils/encryptionService');
const { uploadStreamToIPFS } = require('./src/utils/ipfsService');

const sizes = [
    { label: '100 MB', bytes: 100 * 1024 * 1024 },
    { label: '500 MB', bytes: 500 * 1024 * 1024 },
    { label: '1024 MB', bytes: 1024 * 1024 * 1024 },
    { label: '2048 MB', bytes: 2048 * 1024 * 1024 }
];

async function createDummyFile(filePath, size) {
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        let written = 0;
        const chunkSize = 10 * 1024 * 1024; // 10MB chunk
        const buffer = crypto.randomBytes(chunkSize);

        function write() {
            let ok = true;
            while (written < size && ok) {
                const toWrite = Math.min(chunkSize, size - written);
                written += toWrite;
                if (written === size) {
                    stream.write(buffer.subarray(0, toWrite), () => {
                        stream.end();
                        resolve();
                    });
                } else {
                    ok = stream.write(buffer.subarray(0, toWrite));
                }
            }
            if (written < size) {
                stream.once('drain', write);
            }
        }
        write();
    });
}

async function testPipeline() {
    console.log("Starting Upload Pipeline Benchmark...");
    
    // Ensure temp dirs
    const uploadDir = path.join(__dirname, 'uploads');
    const tempDir = path.join(uploadDir, 'temp');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    for (const size of sizes) {
        console.log(`\n=== Testing ${size.label} ===`);
        const filePath = path.join(tempDir, `dummy-${size.bytes}.bin`);
        const encryptedFilePath = path.join(tempDir, `enc-${size.bytes}.bin`);

        try {
            console.log(`Generating ${size.label} dummy file...`);
            await createDummyFile(filePath, size.bytes);

            // GC before measurement
            if (global.gc) { global.gc(); }
            const startMem = process.memoryUsage().heapUsed;
            let peakMem = startMem;

            // Interval to monitor peak memory
            const interval = setInterval(() => {
                const currentMem = process.memoryUsage().heapUsed;
                if (currentMem > peakMem) peakMem = currentMem;
            }, 100);

            // 1. Encrypt Stream
            const encStart = performance.now();
            await encryptFileStream(filePath, encryptedFilePath);
            const encEnd = performance.now();
            const encTimeMs = encEnd - encStart;

            // 2. Hash Ciphertext Stream
            const hashStream = crypto.createHash('sha256');
            const readHashStream = fs.createReadStream(encryptedFilePath);
            const fileHash = await new Promise((resolve, reject) => {
                readHashStream.pipe(hashStream)
                    .on('finish', () => resolve(hashStream.digest('hex')))
                    .on('error', reject);
            });

            // 3. Upload Stream
            const upStart = performance.now();
            const cid = await uploadStreamToIPFS(encryptedFilePath, `test-${size.label}`);
            const upEnd = performance.now();
            const upTimeMs = upEnd - upStart;

            clearInterval(interval);

            const peakMemMB = ((peakMem - startMem) / 1024 / 1024).toFixed(2);
            const totalTimeS = (encTimeMs + upTimeMs) / 1000;
            const throughput = (size.bytes / 1024 / 1024 / totalTimeS).toFixed(2);

            console.log(`Results for ${size.label}:`);
            console.log(`- Peak RAM Overhead: ${peakMemMB} MB`);
            console.log(`- Encryption Time: ${(encTimeMs / 1000).toFixed(2)} s`);
            console.log(`- Upload Time: ${(upTimeMs / 1000).toFixed(2)} s`);
            console.log(`- Total Throughput: ${throughput} MB/s`);
            console.log(`- Node Process Stability: STABLE (No Crash)`);

        } catch (err) {
            console.error(`Error during ${size.label}:`, err.message);
        } finally {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            if (fs.existsSync(encryptedFilePath)) fs.unlinkSync(encryptedFilePath);
        }
    }
}

testPipeline();
