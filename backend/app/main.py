from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import zkp_routes

app = FastAPI(
    title="ZKP Proof Generation & Verification API",
    description="API for generating and verifying Zero-Knowledge Proofs",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(zkp_routes.router, prefix="/api/zkp", tags=["ZKP"])

@app.get("/")
async def root():
    return {"message": "ZKP Proof Generation & Verification API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
