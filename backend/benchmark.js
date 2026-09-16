const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Mock KMS exactly like before
const mockKmsService = {
    getActiveKeyId: () => 'v2-test',
    getKey: (id) => Buffer.alloc(32, 'a')
};
require.cache[require.resolve('./src/services/kmsService.js')] = {
    exports: mockKmsService
};

const encryptionService = require('./src/utils/encryptionService');

const SIZES_MB = [100, 500, 1024, 2048];
const CHUNK_SIZE = 10 * 1024 * 1024; // Write in 10MB chunks to avoid crashing when generating dummy files

async function generateDummyFile(sizeMB, filePath) {
    const sizeBytes = sizeMB * 1024 * 1024;
    const writeStream = fs.createWriteStream(filePath);
    let written = 0;
    while (written < sizeBytes) {
        const toWrite = Math.min(CHUNK_SIZE, sizeBytes - written);
        const buf = crypto.randomBytes(toWrite);
        if (!writeStream.write(buf)) {
            await new Promise(resolve => writeStream.once('drain', resolve));
        }
        written += toWrite;
    }
    writeStream.end();
    await new Promise(resolve => writeStream.once('finish', resolve));
}

async function runBenchmark(sizeMB) {
    const dummyPath = path.join(__dirname, `dummy_${sizeMB}MB.bin`);
    const encSyncPath = path.join(__dirname, `enc_sync_${sizeMB}MB.bin`);
    const decSyncPath = path.join(__dirname, `dec_sync_${sizeMB}MB.bin`);
    const encStreamPath = path.join(__dirname, `enc_stream_${sizeMB}MB.bin`);
    const decStreamPath = path.join(__dirname, `dec_stream_${sizeMB}MB.bin`);
    
    console.log(`\n--- BENCHMARK: ${sizeMB} MB ---`);
    await generateDummyFile(sizeMB, dummyPath);
    
    // Hash original file to check integrity
    const hashStream = fs.createReadStream(dummyPath);
    const hasher = crypto.createHash('sha256');
    for await (const chunk of hashStream) { hasher.update(chunk); }
    const originalHash = hasher.digest('hex');

    const results = {};

    function trackMemory() {
        let peakRss = 0;
        const interval = setInterval(() => {
            const m = process.memoryUsage();
            if (m.rss > peakRss) peakRss = m.rss;
        }, 50);
        return {
            stop: () => { clearInterval(interval); return peakRss; }
        }
    }

    // 1. Streaming Test
    try {
        console.log(`[Stream] Encrypting ${sizeMB} MB...`);
        const memTracker1 = trackMemory();
        const startCpu1 = process.cpuUsage();
        const start1 = performance.now();
        
        const streamResult = await encryptionService.encryptFileStream(dummyPath, encStreamPath);
        
        const end1 = performance.now();
        const cpu1 = process.cpuUsage(startCpu1);
        const peakRss1 = memTracker1.stop();
        const encTime1 = (end1 - start1) / 1000;
        
        console.log(`[Stream] Decrypting ${sizeMB} MB...`);
        const memTracker2 = trackMemory();
        const startCpu2 = process.cpuUsage();
        const start2 = performance.now();
        
        await encryptionService.decryptFileStream(encStreamPath, decStreamPath);
        
        const end2 = performance.now();
        const cpu2 = process.cpuUsage(startCpu2);
        const peakRss2 = memTracker2.stop();
        const decTime2 = (end2 - start2) / 1000;

        // Hash decrypted stream file
        const decHashStream = fs.createReadStream(decStreamPath);
        const decHasher = crypto.createHash('sha256');
        for await (const chunk of decHashStream) { decHasher.update(chunk); }
        const decHash = decHasher.digest('hex');
        
        results.stream = {
            encTime: encTime1,
            decTime: decTime2,
            peakRamEnc: peakRss1 / (1024*1024),
            peakRamDec: peakRss2 / (1024*1024),
            cpuUserEnc: cpu1.user / 1000000,
            cpuSystemEnc: cpu1.system / 1000000,
            throughputEnc: sizeMB / encTime1,
            throughputDec: sizeMB / decTime2,
            integrity: (decHash === originalHash && streamResult.hash === originalHash) ? 'PASS' : 'FAIL'
        };
    } catch (err) {
        console.error(`[Stream] Error: ${err.message}`);
        results.stream = { error: err.message };
    }

    // 2. Synchronous Test
    try {
        console.log(`[Sync] Encrypting ${sizeMB} MB...`);
        const memTracker3 = trackMemory();
        const startCpu3 = process.cpuUsage();
        const start3 = performance.now();
        
        const rawBuffer = fs.readFileSync(dummyPath);
        const encBlob = encryptionService.encryptFile(rawBuffer);
        fs.writeFileSync(encSyncPath, encBlob);
        
        const end3 = performance.now();
        const cpu3 = process.cpuUsage(startCpu3);
        const peakRss3 = memTracker3.stop();
        const encTime3 = (end3 - start3) / 1000;
        
        console.log(`[Sync] Decrypting ${sizeMB} MB...`);
        const memTracker4 = trackMemory();
        const startCpu4 = process.cpuUsage();
        const start4 = performance.now();
        
        const loadedEncBlob = fs.readFileSync(encSyncPath);
        const decBlob = encryptionService.decryptFile(loadedEncBlob);
        fs.writeFileSync(decSyncPath, decBlob);
        
        const end4 = performance.now();
        const cpu4 = process.cpuUsage(startCpu4);
        const peakRss4 = memTracker4.stop();
        const decTime4 = (end4 - start4) / 1000;

        const decHash = crypto.createHash('sha256').update(decBlob).digest('hex');
        
        results.sync = {
            encTime: encTime3,
            decTime: decTime4,
            peakRamEnc: peakRss3 / (1024*1024),
            peakRamDec: peakRss4 / (1024*1024),
            cpuUserEnc: cpu3.user / 1000000,
            cpuSystemEnc: cpu3.system / 1000000,
            throughputEnc: sizeMB / encTime3,
            throughputDec: sizeMB / decTime4,
            integrity: (decHash === originalHash) ? 'PASS' : 'FAIL'
        };
    } catch (err) {
        console.error(`[Sync] Error/Crash: ${err.message}`);
        results.sync = { error: err.message };
    }
    
    // Clean up
    const safeUnlink = (p) => {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } 
        catch (e) { console.error(`Failed to unlink ${p}: ${e.message}`); }
    };
    safeUnlink(dummyPath);
    safeUnlink(encSyncPath);
    safeUnlink(decSyncPath);
    safeUnlink(encStreamPath);
    safeUnlink(decStreamPath);
    
    return results;
}

async function run() {
    const finalResults = {};
    for (const size of SIZES_MB) {
        if (global.gc) { global.gc(); }
        finalResults[size] = await runBenchmark(size);
        fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(finalResults, null, 2));
    }
    console.log('\n--- FINAL RESULTS JSON ---');
    console.log(JSON.stringify(finalResults, null, 2));
}

run();
