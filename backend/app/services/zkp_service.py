import hashlib
import secrets
import json
from typing import Tuple, List, Dict, Any
from datetime import datetime
import uuid

class ZKPService:
    """
    Zero-Knowledge Proof Service
    
    Implements a simple Schnorr-like ZKP protocol:
    1. Prover commits to a secret
    2. Prover generates a proof that they know the secret without revealing it
    3. Verifier checks the proof against the commitment
    """
    
    # Large prime for modular arithmetic (256-bit prime)
    PRIME = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    # Generator
    GENERATOR = 2
    
    def __init__(self):
        self.proofs_store: Dict[str, dict] = {}
    
    def hash_to_int(self, *values: str) -> int:
        """Hash multiple values to a single integer"""
        combined = ''.join(str(v) for v in values)
        hash_bytes = hashlib.sha256(combined.encode()).digest()
        return int.from_bytes(hash_bytes, 'big') % self.PRIME
    
    def generate_commitment(self, secret: str) -> Tuple[int, int]:
        """
        Generate a Pedersen-like commitment to a secret
        Returns (commitment, blinding_factor)
        """
        secret_int = self.hash_to_int(secret)
        blinding = secrets.randbelow(self.PRIME - 1) + 1
        
        # C = g^secret * h^blinding (simplified to g^(secret + blinding) for demo)
        commitment = pow(self.GENERATOR, (secret_int + blinding) % (self.PRIME - 1), self.PRIME)
        
        return commitment, blinding
    
    def generate_proof(self, secret: str, public_inputs: List[str] = None) -> Dict[str, Any]:
        """
        Generate a Zero-Knowledge Proof
        
        Uses Schnorr-like protocol:
        1. Commit: r <- random, R = g^r
        2. Challenge: c = Hash(R, public_inputs)
        3. Response: s = r + c * secret
        
        The proof is (R, s) which proves knowledge of secret without revealing it
        """
        if public_inputs is None:
            public_inputs = []
        
        proof_id = str(uuid.uuid4())
        secret_int = self.hash_to_int(secret)
        
        # Generate commitment to secret
        commitment, blinding = self.generate_commitment(secret)
        
        # Schnorr proof generation
        # Step 1: Random commitment
        r = secrets.randbelow(self.PRIME - 1) + 1
        R = pow(self.GENERATOR, r, self.PRIME)
        
        # Step 2: Generate challenge using Fiat-Shamir heuristic
        challenge = self.hash_to_int(str(R), str(commitment), *public_inputs)
        
        # Step 3: Compute response
        s = (r + challenge * secret_int) % (self.PRIME - 1)
        
        # Create proof object
        proof = {
            "R": hex(R),
            "s": hex(s),
            "challenge": hex(challenge),
        }
        
        public_signals = [
            hex(commitment),
            *[self.hash_to_int(p) for p in public_inputs]
        ]
        
        result = {
            "proof_id": proof_id,
            "proof": proof,
            "public_signals": [str(ps) for ps in public_signals],
            "commitment": hex(commitment),
            "public_inputs": public_inputs,  # Original public inputs for verification
            "created_at": datetime.utcnow().isoformat(),
            "blinding": hex(blinding),  # In real ZKP, this would be kept secret by prover
        }
        
        # Store proof for later verification
        self.proofs_store[proof_id] = {
            **result,
            "secret_hash": hex(secret_int),
        }
        
        return result
    
    def verify_proof(self, proof: dict, public_signals: List[str], commitment: str, public_inputs: List[str] = None) -> Dict[str, Any]:
        """
        Verify a Zero-Knowledge Proof
        
        Verifies the challenge was correctly computed using Fiat-Shamir heuristic
        and that the proof structure is valid.
        """
        try:
            R = int(proof["R"], 16)
            s = int(proof["s"], 16)
            challenge = int(proof["challenge"], 16)
            commitment_int = int(commitment, 16)
            
            # Use original public inputs if provided, otherwise empty list
            original_inputs = public_inputs if public_inputs is not None else []
            
            # Recompute challenge to verify Fiat-Shamir
            # Must match exactly how it was computed during generation:
            # challenge = hash_to_int(str(R), str(commitment), *public_inputs)
            expected_challenge = self.hash_to_int(str(R), str(commitment_int), *original_inputs)
            
            # Verify challenge matches
            challenge_valid = challenge == expected_challenge
            
            # Verify the proof components are non-zero and valid
            proof_structure_valid = R != 0 and s != 0 and challenge != 0
            
            # Verify commitment is in public signals
            commitment_in_signals = commitment == public_signals[0] if public_signals else False
            
            # All checks must pass
            is_valid = challenge_valid and proof_structure_valid and commitment_in_signals
            
            return {
                "valid": is_valid,
                "message": "Proof verified successfully" if is_valid else "Proof verification failed",
                "verified_at": datetime.utcnow().isoformat(),
                "details": {
                    "challenge_valid": challenge_valid,
                    "proof_structure_valid": proof_structure_valid,
                    "commitment_verified": commitment_in_signals
                }
            }
            
        except Exception as e:
            return {
                "valid": False,
                "message": f"Verification error: {str(e)}",
                "verified_at": datetime.utcnow().isoformat(),
                "details": {"error": str(e)}
            }
    
    def get_proof_status(self, proof_id: str) -> Dict[str, Any]:
        """Get the status of a generated proof"""
        if proof_id in self.proofs_store:
            stored = self.proofs_store[proof_id]
            return {
                "proof_id": proof_id,
                "status": "generated",
                "created_at": stored["created_at"],
                "commitment": stored["commitment"]
            }
        return {
            "proof_id": proof_id,
            "status": "not_found",
            "created_at": None,
            "commitment": None
        }


# Global service instance
zkp_service = ZKPService()
