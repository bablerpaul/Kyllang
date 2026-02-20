from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime

class ProofInput(BaseModel):
    """Input data for proof generation"""
    secret: str = Field(..., description="The secret value to prove knowledge of")
    public_inputs: List[str] = Field(default=[], description="Public inputs for the proof")
    
class GeneratedProof(BaseModel):
    """Generated ZKP proof"""
    proof_id: str
    proof: dict
    public_signals: List[str]
    commitment: str
    created_at: datetime
    
class VerificationRequest(BaseModel):
    """Request to verify a proof"""
    proof: dict = Field(..., description="The proof to verify")
    public_signals: List[str] = Field(..., description="Public signals/inputs")
    commitment: str = Field(..., description="The commitment to verify against")
    public_inputs: List[str] = Field(default=[], description="Original public inputs used during proof generation")

class VerificationResult(BaseModel):
    """Result of proof verification"""
    valid: bool
    message: str
    verified_at: datetime
    details: Optional[dict] = None

class ProofStatus(BaseModel):
    """Status of a proof"""
    proof_id: str
    status: str
    created_at: datetime
    verified: Optional[bool] = None
    verified_at: Optional[datetime] = None
