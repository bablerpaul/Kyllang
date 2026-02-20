import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ProofInput {
  secret: string;
  public_inputs: string[];
}

export interface GeneratedProof {
  proof_id: string;
  proof: {
    R: string;
    s: string;
    challenge: string;
  };
  public_signals: string[];
  commitment: string;
  public_inputs: string[];
  created_at: string;
}

export interface VerificationRequest {
  proof: {
    R: string;
    s: string;
    challenge: string;
  };
  public_signals: string[];
  commitment: string;
  public_inputs: string[];
}

export interface VerificationResult {
  valid: boolean;
  message: string;
  verified_at: string;
  details?: {
    challenge_valid: boolean;
    proof_structure_valid: boolean;
    commitment_verified: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export const zkpApi = {
  // Generate a proof
  async generateProof(input: ProofInput): Promise<ApiResponse<GeneratedProof>> {
    const response = await api.post('/api/zkp/generate', input);
    return response.data;
  },

  // Verify a proof
  async verifyProof(request: VerificationRequest): Promise<ApiResponse<VerificationResult>> {
    const response = await api.post('/api/zkp/verify', request);
    return response.data;
  },

  // Get proof status
  async getProofStatus(proofId: string): Promise<ApiResponse<any>> {
    const response = await api.get(`/api/zkp/status/${proofId}`);
    return response.data;
  },

  // Get ZKP system info
  async getInfo(): Promise<any> {
    const response = await api.get('/api/zkp/info');
    return response.data;
  },

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const response = await api.get('/health');
    return response.data;
  },
};

export default zkpApi;
