require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ipfsService = require('../src/utils/ipfsService');
const encryptionService = require('../src/utils/encryptionService');

// Define temp file paths
const plaintextFilePath = path.join(__dirname, '../uploads/temp/real_ipfs_test_plaintext.txt');
const encryptedFilePath = path.join(__dirname, '../uploads/temp/real_ipfs_test_encrypted.bin');
const downloadedFilePath = path.join(__dirname, '../uploads/temp/real_ipfs_test_downloaded.bin');
const decryptedFilePath = path.join(__dirname, '../uploads/temp/real_ipfs_test_decrypted.txt');

async function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function runRealIpfsValidation() {
    console.log("=== STARTING REAL IPFS VALIDATION ===\n");

    // 0. Ensure environment
    if (!process.env.PINATA_JWT && !process.env.IPFS_NODE_URL) {
        console.warn("⚠️ WARNING: PINATA_JWT and IPFS_NODE_URL are not set.");
        console.warn("Unless you are running a local IPFS daemon on 127.0.0.1:5001, this will fail.");
        console.warn("We are NOT using TEST_MODE. Real network operations will be attempted.\n");
    }

    // Force test mode off to ensure real network stack is used
    process.env.TEST_MODE = 'false';

    try {
        await ensureDir(path.join(__dirname, '../uploads/temp'));

        // 1. Create a dummy plaintext medical file
        const dummyPhi = "PATIENT_NAME: John Doe\nDIAGNOSIS: Top Secret Medical Condition\nDOB: 1980-01-01\nCONFIDENTIAL PHI CONTENT.";
        fs.writeFileSync(plaintextFilePath, dummyPhi);
        console.log(`✅ Created plaintext dummy medical file.`);

        // 2. Encrypt the medical file
        console.log("Encrypting file...");
        const encryptionResult = await encryptionService.encryptFileStream(plaintextFilePath, encryptedFilePath);
        const uploadHash = encryptionResult.hash;
        console.log(`✅ File encrypted successfully.`);
        console.log(`🔒 Ciphertext SHA-256 Hash: ${uploadHash}`);
        
        // 3. Confirm plaintext PHI never gets uploaded
        const encryptedDataBuffer = fs.readFileSync(encryptedFilePath);
        const encryptedDataString = encryptedDataBuffer.toString('utf8');
        if (encryptedDataString.includes("John Doe") || encryptedDataString.includes("Top Secret")) {
            throw new Error("CRITICAL SECURITY FAILURE: Plaintext PHI leaked into encrypted blob!");
        }
        console.log(`✅ Verified encrypted payload contains zero plaintext PHI.`);

        // 4. Upload to Real IPFS (Pinata or Local Node)
        console.log(`\nUploading to IPFS...`);
        const cid = await ipfsService.uploadStreamToIPFS(encryptedFilePath, 'secure_medical_record.bin');
        console.log(`✅ Upload successful!`);
        console.log(`🌐 IPFS CID: ${cid}`);

        // 5. Retrieve it using the returned CID
        console.log(`\nDownloading from IPFS Gateway...`);
        const downloadedBuffer = await ipfsService.fetchFromIPFS(cid);
        fs.writeFileSync(downloadedFilePath, downloadedBuffer);
        console.log(`✅ Download successful! (${downloadedBuffer.length} bytes)`);

        // 6. Verify the downloaded ciphertext hash
        const downloadHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
        if (downloadHash !== uploadHash) {
            throw new Error(`Integrity verification failed! Upload Hash: ${uploadHash}, Download Hash: ${downloadHash}`);
        }
        console.log(`✅ Downloaded ciphertext hash perfectly matches upload hash: ${downloadHash}`);

        // 7. Decrypt the downloaded file
        console.log(`\nDecrypting downloaded file...`);
        await encryptionService.decryptFileStream(downloadedFilePath, decryptedFilePath);
        console.log(`✅ Decryption successful!`);

        // 8. Verify the original file matches exactly
        const decryptedContent = fs.readFileSync(decryptedFilePath, 'utf8');
        if (decryptedContent !== dummyPhi) {
            throw new Error("Decrypted content does not match original plaintext!");
        }
        console.log(`✅ Plaintext content matches original PHI identically.`);

        console.log("\n🎉 REAL IPFS VALIDATION SUCCEEDED 🎉");

    } catch (err) {
        console.error(`\n❌ REAL IPFS VALIDATION FAILED:`, err.message);
    } finally {
        // Cleanup temp files
        [plaintextFilePath, encryptedFilePath, downloadedFilePath, decryptedFilePath].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
        console.log("\nCleanup complete.");
    }
}

runRealIpfsValidation();
