const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

class ZKPService {
  constructor() {
    this.wasmPath = path.join(__dirname, '../../verification_keys/certificate_validator.wasm');
    this.zkeyPath = path.join(__dirname, '../../verification_keys/certificate_validator.zkey');
    this.vKeyPath = path.join(__dirname, '../../verification_keys/verification_key.json');
    
    // Fallback store for local dev where trusted setup hasn't run
    this.proofsStore = new Map();
  }

  /**
   * Generates a Zero-Knowledge Proof using SnarkJS Groth16
   * @param {Object} privateInputs - { patientId, diagnosis, validFrom, validUntil, secretSalt }
   * @param {Object} publicInputs - { currentDate, certificateHash }
   */
  async generateProof(privateInputs, publicInputs) {
    const proofId = uuidv4();
    
    // Format inputs for Circom
    const input = {
      patientId: privateInputs.patientId,
      diagnosis: privateInputs.diagnosis,
      validFrom: privateInputs.validFrom,
      validUntil: privateInputs.validUntil,
      secretSalt: privateInputs.secretSalt,
      currentDate: publicInputs.currentDate,
      certificateHash: publicInputs.certificateHash
    };

    try {
      // Check if compiled circuit exists
      if (!fs.existsSync(this.wasmPath) || !fs.existsSync(this.zkeyPath)) {
        console.error("CRITICAL CONFIGURATION ERROR: Circom WASM/ZKEY not found!");
        throw new Error("Failed to generate ZK Proof: ZK configuration is missing.");
      }

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          input,
          this.wasmPath,
          this.zkeyPath
      );

      const result = {
        proof_id: proofId,
        proof,
        public_signals: publicSignals,
        created_at: new Date().toISOString(),
        is_snarkjs: true
      };

      this.proofsStore.set(proofId, result);
      return result;
    } catch (error) {
      console.error("ZKP Generation Failed:", error);
      throw new Error("Failed to generate ZK Proof: " + error.message);
    }
  }

  /**
   * Verifies a Zero-Knowledge Proof using SnarkJS Groth16
   * @param {Object} proof - The Groth16 proof object
   * @param {Array} publicSignals - Array of public signals [nullifierHash, currentDate, certificateHash]
   */
  async verifyProof(proof, publicSignals) {
    try {
        if (!fs.existsSync(this.vKeyPath)) {
            console.error("CRITICAL CONFIGURATION ERROR: Genuine ZK vKey not found!");
            return {
                valid: false,
                message: "Verification failed: ZK configuration is missing. Refusing to perform mock structural verification.",
                verified_at: new Date().toISOString()
            };
        }

        const vKey = JSON.parse(fs.readFileSync(this.vKeyPath, 'utf8'));
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        
        return {
            valid: res,
            message: res ? "Proof verified successfully (SnarkJS)" : "Proof verification failed (SnarkJS)",
            verified_at: new Date().toISOString(),
            details: { proof_structure_valid: true }
        };
    } catch (e) {
      return {
        valid: false,
        message: `Verification error: ${e.message}`,
        verified_at: new Date().toISOString(),
        details: { error: e.message }
      };
    }
  }
}

module.exports = new ZKPService();
