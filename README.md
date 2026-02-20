# ZKP Proof Generation & Verification Platform

A full-stack web application for generating and verifying Zero-Knowledge Proofs.

## Features

- **Proof Generation**: Generate ZKP proofs using Schnorr-like protocol with Fiat-Shamir heuristic
- **Proof Verification**: Verify proofs without revealing the secret
- **Modern UI**: Clean, responsive interface with dark theme
- **REST API**: Full API for integration with other systems

## Tech Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **Pydantic**: Data validation using Python type hints
- **Uvicorn**: ASGI server for production

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **Axios**: HTTP client

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python run.py
```

The API will be available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

## API Endpoints

### Generate Proof
```
POST /api/zkp/generate
Content-Type: application/json

{
  "secret": "your-secret-value",
  "public_inputs": ["optional", "public", "values"]
}
```

### Verify Proof
```
POST /api/zkp/verify
Content-Type: application/json

{
  "proof": {
    "R": "0x...",
    "s": "0x...",
    "challenge": "0x..."
  },
  "public_signals": ["0x..."],
  "commitment": "0x..."
}
```

### Get Proof Status
```
GET /api/zkp/status/{proof_id}
```

### Get System Info
```
GET /api/zkp/info
```

## How It Works

### Zero-Knowledge Proof Protocol

This implementation uses a Schnorr-like proof system:

1. **Commitment Phase**: The prover commits to a secret value using a Pedersen-like commitment scheme
2. **Challenge**: A challenge is generated using the Fiat-Shamir heuristic (non-interactive)
3. **Response**: The prover computes a response that proves knowledge of the secret
4. **Verification**: The verifier checks the mathematical relationship without learning the secret

### Security Properties

- **Completeness**: An honest prover can always convince an honest verifier
- **Soundness**: A dishonest prover cannot convince the verifier (except with negligible probability)
- **Zero-Knowledge**: The verifier learns nothing about the secret beyond its existence

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── models.py         # Pydantic models
│   │   ├── routes/
│   │   │   └── zkp_routes.py # API routes
│   │   └── services/
│   │       └── zkp_service.py # ZKP logic
│   ├── requirements.txt
│   └── run.py
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── globals.css
    │   │   ├── layout.tsx
    │   │   └── page.tsx
    │   └── lib/
    │       └── api.ts        # API client
    ├── package.json
    └── tailwind.config.js
```

## Disclaimer

This is a demonstration implementation for educational purposes. For production use, consider using established ZKP libraries such as:

- [snarkjs](https://github.com/iden3/snarkjs)
- [circom](https://github.com/iden3/circom)
- [arkworks](https://github.com/arkworks-rs)
- [bellman](https://github.com/zkcrypto/bellman)

## License

MIT
