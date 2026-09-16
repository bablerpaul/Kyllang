const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Since kmsService might require DB or other things, let's mock it for the test
const mockKmsService = {
    getActiveKeyId: () => 'v2-test',
    getKey: (id) => {
        if (id === 'v1') return Buffer.alloc(32, 'a');
        return Buffer.alloc(32, 'b');
    }
};
require.cache[require.resolve('./src/services/kmsService.js')] = {
    exports: mockKmsService
};

const encryptionService = require('./src/utils/encryptionService');

async function runTests() {
    console.log("Creating dummy 10MB file...");
    const dummyPath = path.join(__dirname, 'dummy.txt');
    const encPath = path.join(__dirname, 'dummy.enc');
    const decPath = path.join(__dirname, 'dummy.dec');
    
    // Create 10MB file
    const buffer = crypto.randomBytes(10 * 1024 * 1024);
    fs.writeFileSync(dummyPath, buffer);
    const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    try {
        console.log("Testing encryptFileStream...");
        const result = await encryptionService.encryptFileStream(dummyPath, encPath);
        console.log("Result:", result);
        
        if (result.hash !== originalHash) {
            throw new Error("Hash mismatch!");
        }
        if (result.size !== 10 * 1024 * 1024) {
            throw new Error("Size mismatch!");
        }
        console.log("✅ encryptFileStream works!");
        
        console.log("Testing decryptFileStream...");
        await encryptionService.decryptFileStream(encPath, decPath);
        
        const decBuffer = fs.readFileSync(decPath);
        const decHash = crypto.createHash('sha256').update(decBuffer).digest('hex');
        
        if (decHash !== originalHash) {
            throw new Error("Decrypted file hash mismatch!");
        }
        console.log("✅ decryptFileStream works!");
        
        console.log("Testing backwards compatibility with in-memory V1 blob...");
        const legacyIv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', mockKmsService.getKey('v1'), legacyIv);
        const encryptedBuffer = Buffer.concat([cipher.update(Buffer.from("Hello Legacy")), cipher.final()]);
        const legacyBlob = Buffer.concat([legacyIv, encryptedBuffer]);
        
        const legacyPath = path.join(__dirname, 'legacy.enc');
        const legacyDecPath = path.join(__dirname, 'legacy.dec');
        fs.writeFileSync(legacyPath, legacyBlob);
        
        await encryptionService.decryptFileStream(legacyPath, legacyDecPath);
        const legacyDecText = fs.readFileSync(legacyDecPath, 'utf8');
        if (legacyDecText !== "Hello Legacy") {
            throw new Error("Legacy decryption failed!");
        }
        console.log("✅ Legacy V1 decryption works!");

        console.log("All tests passed!");
    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        // Cleanup
        if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
        if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
        if (fs.existsSync(decPath)) fs.unlinkSync(decPath);
        if (fs.existsSync(path.join(__dirname, 'legacy.enc'))) fs.unlinkSync(path.join(__dirname, 'legacy.enc'));
        if (fs.existsSync(path.join(__dirname, 'legacy.dec'))) fs.unlinkSync(path.join(__dirname, 'legacy.dec'));
    }
}

runTests();
