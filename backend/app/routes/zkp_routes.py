from fastapi import APIRouter, HTTPException
from datetime import datetime
from app.models import ProofInput, GeneratedProof, VerificationRequest, VerificationResult, ProofStatus
from app.services.zkp_service import zkp_service

router = APIRouter()

@router.post("/generate", response_model=dict)
async def generate_proof(proof_input: ProofInput):
    """
    Generate a Zero-Knowledge Proof
    
    This endpoint takes a secret value and optional public inputs,
    then generates a ZKP that proves knowledge of the secret without revealing it.
    """
    try:
        result = zkp_service.generate_proof(
            secret=proof_input.secret,
            public_inputs=proof_input.public_inputs
        )
        return {
            "success": True,
            "data": result,
            "message": "Proof generated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate proof: {str(e)}")

@router.post("/verify", response_model=dict)
async def verify_proof(verification_request: VerificationRequest):
    """
    Verify a Zero-Knowledge Proof
    
    This endpoint verifies that a given proof is valid for the provided
    public signals and commitment.
    """
    try:
        result = zkp_service.verify_proof(
            proof=verification_request.proof,
            public_signals=verification_request.public_signals,
            commitment=verification_request.commitment,
            public_inputs=verification_request.public_inputs
        )
        return {
            "success": True,
            "data": result,
            "message": "Verification completed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@router.get("/status/{proof_id}", response_model=dict)
async def get_proof_status(proof_id: str):
    """
    Get the status of a generated proof
    """
    try:
        status = zkp_service.get_proof_status(proof_id)
        return {
            "success": True,
            "data": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")

@router.get("/info")
async def get_zkp_info():
    """
    Get information about the ZKP system
    """
    return {
        "name": "Schnorr-like Zero-Knowledge Proof System",
        "version": "1.0.0",
        "description": "A demonstration ZKP system using Schnorr-like proofs with Fiat-Shamir heuristic",
        "capabilities": [
            "Proof of knowledge of a secret",
            "Non-interactive proofs (Fiat-Shamir)",
            "Commitment scheme",
            "Proof verification"
        ],
        "security_level": "256-bit",
        "disclaimer": "This is a demonstration implementation. Use production-grade libraries for real applications."
    }
