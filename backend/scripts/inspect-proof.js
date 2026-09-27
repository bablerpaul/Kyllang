const snarkjs = require('snarkjs');
const path = require('path');
const { buildPoseidon } = require('circomlibjs');

async function main() {
    const P = await buildPoseidon();
    
    const patientId = '1234567890';
    const diagnosisCode = '987654321';
    const validFrom = '1700000000';
    const secretSalt = '123456';
    
    // Compute Poseidon(patientId, diagnosisCode, validFrom, secretSalt)
    const expectedCommitment = P.F.toString(P([patientId, diagnosisCode, validFrom, secretSalt]));

    const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'zk');
    const wasmPath  = path.join(ARTIFACTS_DIR, 'certificate_proof_js', 'certificate_proof.wasm');
    const zkeyPath  = path.join(ARTIFACTS_DIR, 'circuit_final.zkey');

    const input = {
        patientId,
        diagnosisCode,
        validFrom,
        secretSalt,
        expectedCommitment,
        challengeNonce: '9999999999'
    };

    try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
        console.log('pi_a length:', proof.pi_a.length);
        console.log('pi_a elements:');
        proof.pi_a.forEach((val, i) => {
            console.log(`  [${i}] type: ${typeof val}, value: ${val}`);
        });

        console.log('\npi_c length:', proof.pi_c.length);
        console.log('pi_c elements:');
        proof.pi_c.forEach((val, i) => {
            console.log(`  [${i}] type: ${typeof val}, value: ${val}`);
        });
    } catch (e) {
        console.error('Error generating proof:', e);
    }
}
main();
