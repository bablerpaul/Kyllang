const mongoose = require('mongoose');
const { Certificate, User, Patient } = require('./backend/src/models');
const CertificateRequest = require('./backend/models/CertificateRequest');
const { ethers } = require('ethers');

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang');
    
    const reqCount = await CertificateRequest.countDocuments();
    const certCount = await Certificate.countDocuments();
    
    console.log('CertificateRequests:', reqCount);
    console.log('Certificates:', certCount);
    
    try {
        const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const blockNum = await provider.getBlockNumber();
        console.log('Blockchain Blocks:', blockNum);
    } catch(e) {
        console.log('Blockchain Blocks: Error connecting to Ganache');
    }
    
    process.exit(0);
}
main();
