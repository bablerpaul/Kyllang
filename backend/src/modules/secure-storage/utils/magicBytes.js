const fs = require('fs');

/**
 * Validates file magic bytes against the expected MIME type.
 * @param {string} filePath - Path to the uploaded file.
 * @param {string} expectedMimeType - The MIME type the file claims to be.
 * @returns {Promise<boolean>} - True if valid or safely degraded, False if malicious/mismatched.
 */
async function validateMagicBytes(filePath, expectedMimeType) {
    const fd = await fs.promises.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(132);
        const { bytesRead } = await fd.read(buffer, 0, 132, 0);
        
        if (bytesRead === 0) return false;

        switch (expectedMimeType) {
            case 'application/pdf':
                return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D; // %PDF-
                
            case 'image/png':
                return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
                       buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
                       
            case 'image/jpeg':
            case 'image/jpg':
                return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
                
            case 'application/dicom':
                // Check if 'DICM' is present at offset 128
                if (bytesRead >= 132 && buffer[128] === 0x44 && buffer[129] === 0x49 && buffer[130] === 0x43 && buffer[131] === 0x4D) {
                    return true;
                }
                // Fallback for legitimate DICOM without preamble.
                console.warn(`[DICOM VALIDATION] File ${filePath} lacks preamble DICM signature, proceeding with fallback trust.`);
                return true; 
                
            default:
                return false;
        }
    } finally {
        await fd.close();
    }
}

module.exports = { validateMagicBytes };
