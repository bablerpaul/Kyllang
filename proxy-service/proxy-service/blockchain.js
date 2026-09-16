const { ethers } = require('ethers');

const EmergencyEscrowABI = [
  "function getSession(bytes32 vrfLookupToken, address requestingDoctorAddress) external view returns (bool active, uint256 expiresAt)"
];

let provider;
let emergencyEscrowContract;

function initBlockchain() {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
    provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // In production/docker, the address should be injected via env vars.
    // For local dev, we might have a hardcoded fallback or wait for it.
    const address = process.env.EMERGENCY_ESCROW_ADDRESS;
    if (address) {
        emergencyEscrowContract = new ethers.Contract(address, EmergencyEscrowABI, provider);
        console.log(`[Blockchain] Connected EmergencyEscrow at ${address}`);
    } else {
        console.warn(`[Blockchain] EMERGENCY_ESCROW_ADDRESS missing. Contract calls will fail.`);
    }
}

function getContract(name) {
    if (name === 'EmergencyEscrow') return emergencyEscrowContract;
    return null;
}

module.exports = { initBlockchain, getContract };
