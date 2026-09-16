const blockchain = require('./blockchain');
const { ethers } = require('ethers');

async function seedOtherModules() {
    console.log("Seeding other modules...");
    
    // Certificate Registry
    const certContract = blockchain.getContract('CertificateRegistry');
    if (certContract) {
        console.log("Seeding CertificateRegistry transactions...");
        try {
            // addIssuer
            const tx1 = await certContract.addIssuer('0x6F396F41Fb00Cf1b4BC35d24feD0479Eb9Bf338a');
            await tx1.wait();
            console.log("addIssuer success");
            
            // registerCertificate (dummy hashes)
            for (let i = 0; i < 5; i++) {
                const dummyHash = ethers.id(`dummy_cert_${i}`);
                const tx = await certContract.registerCertificate(dummyHash);
                await tx.wait();
                console.log(`registerCertificate ${i+1} success`);
            }
            
            // revokeCertificate
            const revokeHash = ethers.id('dummy_cert_0');
            const tx2 = await certContract.revokeCertificate(revokeHash);
            await tx2.wait();
            console.log("revokeCertificate success");
            
        } catch (e) {
            console.error("CertificateRegistry error:", e.message);
        }
    }
    
    // Emergency Escrow
    const escrowContract = blockchain.getContract('EmergencyEscrow');
    if (escrowContract) {
        console.log("Seeding EmergencyEscrow transactions...");
        try {
            // setMCI
            const tx3 = await escrowContract.setMCI(true);
            await tx3.wait();
            console.log("setMCI success");
            
            // openSession & closeSession
            for (let i = 0; i < 4; i++) {
                const token = ethers.id(`dummy_vrf_${i}`);
                const doc = '0x1111111111111111111111111111111111111111';
                const duration = 3600; // 1 hour
                
                const tx = await escrowContract.openSession(token, doc, duration);
                await tx.wait();
                console.log(`openSession ${i+1} success`);
                
                if (i % 2 === 0) { // close some
                    const txClose = await escrowContract.closeSession(token);
                    await txClose.wait();
                    console.log(`closeSession ${i+1} success`);
                }
            }
            
        } catch (e) {
            console.error("EmergencyEscrow error:", e.message);
        }
    }
    
    console.log("Seeding complete.");
    process.exit(0);
}

seedOtherModules();
