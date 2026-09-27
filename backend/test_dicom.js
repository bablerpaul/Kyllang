const { validateMagicBytes } = require('./src/modules/secure-storage/utils/magicBytes');
const fs = require('fs');

async function testDICOM() {
    const validDicom = 'temp_valid.dcm';
    const htmlDicom = 'temp_html.dcm';
    const randomDicom = 'temp_random.dcm';
    
    // Create valid DICOM (128 null bytes + DICM)
    const validBuffer = Buffer.alloc(132);
    validBuffer.write('DICM', 128);
    fs.writeFileSync(validDicom, validBuffer);
    
    // Create HTML masquerading as DICOM
    fs.writeFileSync(htmlDicom, '<script>alert(1)</script>');
    
    // Create random executable
    const randomBuffer = Buffer.alloc(132);
    for(let i=0; i<132; i++) randomBuffer[i] = Math.floor(Math.random() * 255);
    fs.writeFileSync(randomDicom, randomBuffer);

    console.log("=== DICOM VALIDATION TEST ===");
    const res1 = await validateMagicBytes(validDicom, 'application/dicom');
    console.log("A. Valid DICOM with DICM preamble:", res1);
    
    const res2 = await validateMagicBytes(htmlDicom, 'application/dicom');
    console.log("C. HTML renamed .dcm:", res2);
    
    const res3 = await validateMagicBytes(randomDicom, 'application/dicom');
    console.log("D. Random content renamed .dcm:", res3);
    
    fs.unlinkSync(validDicom);
    fs.unlinkSync(htmlDicom);
    fs.unlinkSync(randomDicom);
}

testDICOM();
