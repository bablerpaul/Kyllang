pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template CertificateValidator() {
    // Private Inputs
    signal input patientId;
    signal input diagnosis;
    signal input validFrom;
    signal input validUntil;
    signal input secretSalt;

    // Public Inputs
    signal input currentDate;
    signal input certificateHash;

    // Output
    signal output nullifierHash;

    // 1. Verify Date Range constraints
    // currentDate >= validFrom  =>  validFrom <= currentDate
    component lessEqFrom = LessEqThan(64);
    lessEqFrom.in[0] <== validFrom;
    lessEqFrom.in[1] <== currentDate;
    lessEqFrom.out === 1;

    // currentDate <= validUntil
    component lessEqUntil = LessEqThan(64);
    lessEqUntil.in[0] <== currentDate;
    lessEqUntil.in[1] <== validUntil;
    lessEqUntil.out === 1;

    // 2. Hash Integrity (Poseidon hash of the 5 private inputs)
    component poseidon = Poseidon(5);
    poseidon.inputs[0] <== patientId;
    poseidon.inputs[1] <== diagnosis;
    poseidon.inputs[2] <== validFrom;
    poseidon.inputs[3] <== validUntil;
    poseidon.inputs[4] <== secretSalt;

    // Enforce that the provided certificateHash matches the private inputs
    poseidon.out === certificateHash;

    // 3. Nullifier Generation to prevent replay attacks
    // nullifierHash = Poseidon(secretSalt, certificateHash)
    component nullifierPoseidon = Poseidon(2);
    nullifierPoseidon.inputs[0] <== secretSalt;
    nullifierPoseidon.inputs[1] <== certificateHash;

    nullifierHash <== nullifierPoseidon.out;
}

component main {public [currentDate, certificateHash]} = CertificateValidator();
