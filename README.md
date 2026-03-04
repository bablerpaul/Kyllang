<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=900&size=48&duration=3000&pause=1000&color=FFFFFF&center=true&vCenter=true&width=500&height=80&lines=KYLLANG" alt="KYLLANG" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=300&size=14&duration=4000&pause=2000&color=888888&center=true&vCenter=true&width=450&height=30&lines=zero-knowledge+proof+platform" alt="zero-knowledge proof platform" />
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/ZKP-Schnorr_Protocol-white?style=flat-square&labelColor=000000" alt="ZKP" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Backend-FastAPI-white?style=flat-square&labelColor=000000" alt="FastAPI" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Frontend-Next.js_14-white?style=flat-square&labelColor=000000" alt="Next.js" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-white?style=flat-square&labelColor=000000" alt="MIT" /></a>
</p>

<br/>

<p align="center">
  <samp>Generate · Verify · Trust — without revealing the secret.</samp>
</p>

---

<br/>

## `>` About

<samp>
Kyllang is a full-stack zero-knowledge proof platform that enables users to generate and verify cryptographic proofs without ever exposing the underlying secret. Built with a minimalist dark-themed UI featuring a stardust particle background, it delivers a premium experience for interacting with ZKP technology.
</samp>

<br/><br/>

## `>` Features

<table>
  <tr>
    <td width="50%">
      <h3><samp>🔐 Proof Generation</samp></h3>
      <samp>Generate ZKP proofs using Schnorr-like protocol with Fiat-Shamir heuristic. Export proofs as downloadable PDF certificates.</samp>
    </td>
    <td width="50%">
      <h3><samp>✅ Proof Verification</samp></h3>
      <samp>Verify proofs without revealing the secret. Upload Kyllang proof certificates or enter data manually.</samp>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3><samp>🌌 Immersive UI</samp></h3>
      <samp>Clean black interface with animated stardust particles, shooting stars, and the Orbitron display font.</samp>
    </td>
    <td width="50%">
      <h3><samp>⚡ REST API</samp></h3>
      <samp>Full API with proof generation, verification, status tracking, and system info endpoints.</samp>
    </td>
  </tr>
</table>

<br/>

## `>` Tech Stack

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   BACKEND              FRONTEND            PROTOCOL          ║
║   ───────              ────────            ────────          ║
║   FastAPI              Next.js 14          Schnorr ZKP       ║
║   Pydantic             TypeScript          Fiat-Shamir       ║
║   Uvicorn              Tailwind CSS        Pedersen Commit   ║
║   Python 3.9+          Orbitron Font       SHA-256 Hash      ║
║                        jsPDF                                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

<br/>

## `>` Quick Start

<details>
<summary><samp><b>📦 Prerequisites</b></samp></summary>
<br/>

| Dependency | Version |
|:-----------|:--------|
| <samp>Python</samp> | `3.9+` |
| <samp>Node.js</samp> | `18+` |
| <samp>npm</samp> | `latest` |

</details>

<br/>

### <samp>Backend</samp>

```bash
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS / Linux

# Install dependencies & launch
pip install -r requirements.txt
python run.py
```

> <samp>API runs at</samp> **`http://localhost:8000`**

<br/>

### <samp>Frontend</samp>

```bash
cd frontend

# Install dependencies & launch
npm install
npm run dev
```

> <samp>App runs at</samp> **`http://localhost:3000`**

<br/>

## `>` API Reference

<details>
<summary><samp><b>POST</b> /api/zkp/generate</samp></summary>

```json
{
  "secret": "your-secret-value",
  "public_inputs": ["optional", "public", "values"]
}
```

<samp>Generates a zero-knowledge proof for the given secret.</samp>

</details>

<details>
<summary><samp><b>POST</b> /api/zkp/verify</samp></summary>

```json
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

<samp>Verifies a proof without learning the secret.</samp>

</details>

<details>
<summary><samp><b>GET</b> /api/zkp/status/{proof_id}</samp></summary>

<samp>Returns the current status of a previously generated proof.</samp>

</details>

<details>
<summary><samp><b>GET</b> /api/zkp/info</samp></summary>

<samp>Returns system information and supported protocol details.</samp>

</details>

<br/>

## `>` How It Works

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│  COMMITMENT │───▶│  CHALLENGE  │───▶│  RESPONSE   │───▶│   VERIFY    │
│             │    │             │    │             │    │             │
│  Prover     │    │ Fiat-Shamir │    │  Prover     │    │  Verifier   │
│  commits to │    │  heuristic  │    │  computes   │    │  checks the │
│  secret     │    │  generates  │    │  proof of   │    │  math, not  │
│  value      │    │  challenge  │    │  knowledge  │    │  the secret │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

<br/>

### <samp>Security Guarantees</samp>

| Property | Description |
|:---------|:------------|
| <samp>**Completeness**</samp> | <samp>An honest prover can always convince an honest verifier</samp> |
| <samp>**Soundness**</samp> | <samp>A dishonest prover cannot convince the verifier (except with negligible probability)</samp> |
| <samp>**Zero-Knowledge**</samp> | <samp>The verifier learns nothing about the secret beyond its existence</samp> |

<br/>

## `>` Project Structure

```
kyllang/
├── backend/
│   ├── app/
│   │   ├── main.py               ← FastAPI application entry
│   │   ├── models.py             ← Pydantic request/response models
│   │   ├── routes/
│   │   │   └── zkp_routes.py     ← API route handlers
│   │   └── services/
│   │       └── zkp_service.py    ← Core ZKP cryptographic logic
│   ├── requirements.txt
│   └── run.py                    ← Server launcher
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── globals.css        ← Stardust animations & theme
    │   │   ├── layout.tsx         ← Root layout with navigation
    │   │   ├── page.tsx           ← Proof generation page
    │   │   └── verify/
    │   │       └── page.tsx       ← Proof verification page
    │   ├── components/
    │   │   └── Stardust.tsx       ← Particle background effect
    │   └── lib/
    │       └── api.ts             ← Axios API client
    ├── package.json
    └── tailwind.config.js
```

<br/>

## `>` Disclaimer

<samp>
This is a demonstration implementation for educational purposes. For production use, consider established ZKP libraries:
</samp>

<samp>

[`snarkjs`](https://github.com/iden3/snarkjs) · [`circom`](https://github.com/iden3/circom) · [`arkworks`](https://github.com/arkworks-rs) · [`bellman`](https://github.com/zkcrypto/bellman)

</samp>

<br/>

## `>` License

<samp>MIT — free to use, modify, and distribute.</samp>

---

<p align="center">
  <samp>built with precision · <b>kyllang</b></samp>
</p>
