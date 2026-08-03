# Blockchain-Based Hospital Electronic Medical Record (EMR) System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-v18-blue.svg)](https://reactjs.org/)
[![Solidity Version](https://img.shields.io/badge/Solidity-%5E0.8.0-lightgrey.svg)](https://soliditylang.org/)

An enterprise-grade, decentralized **Hospital Electronic Medical Record (EMR) & Verification System**. This platform combines confidential clinical encounters, IPFS decentralized storage, cryptographic SHA-256 data hashing, Ethereum smart contracts (`EMRRegistry.sol`), patient-controlled access consent, automated audit logging, insurance adjudication, and an integrated Medical Certificate verification portal.

---

## 🆕 Recent Changes & Updates

- **Production Security Hardening**: Migrated to 15-minute Access Tokens and 7-day Refresh Tokens delivered securely via `httpOnly` cookies (XSS immune). Enforced strict `helmet` HTTP headers, global rate limiting, and exact CORS origins.
- **Asynchronous Architecture & Redis**: Decoupled Blockchain anchoring and Audit Logging into highly resilient Redis-backed background queues. API response times plummeted from ~28s to ~2s.
- **Streaming & Memory Optimization**: Replaced legacy memory storage with disk streaming. AES-256 encryption and IPFS uploads are now pipelined, completely preventing Node.js OutOfMemory crashes.
- **Admin Monitoring Dashboard**: New live telemetry dashboard tracking server CPU, RAM, active users, storage metrics, and blockchain node health.
- **Automated Backup Manager**: Deployed a smart Cron Worker that natively exports all MongoDB collections to JSON every 24 hours, safely backing up metadata without pulling gigabytes of actual files from IPFS.
- **Unified Smart Contract (`EMRRegistry.sol`)**: Successfully merged legacy hash anchoring functionality with the new advanced EMR Record system. No need for separate contracts!
- **Ganache Blockchain Integration**: Full support for local Ganache testnets. Successfully connected backend endpoints to anchor and verify transactions instantly.

---

## 📋 Table of Contents
- [Project Description](#-project-description)
- [Key Features](#-key-features)
- [Technologies Used](#-technologies-used)
- [Installation & Setup Guide](#-installation--setup-guide)
- [Environment Variables](#-environment-variables)
- [Complete Project Workflow](#-complete-project-workflow)
- [Smart Contract Specification](#-smart-contract-specification)
- [Troubleshooting](#-troubleshooting)

---

## 📖 Project Description

The **Hospital Electronic Medical Record System** is a next-generation healthcare data platform designed to overcome data silos, unauthorized access, and medical record tampering. 

Building upon an established **Medical Certificate Verification System**, this platform extends functionality to support multi-encounter EMRs, diagnostic lab test reports (Blood Tests, Urine Tests, MRI, CT Scans, ECG, X-rays, Ultrasound), IPFS decentralized storage gateway streams, automated SHA-256 data hashing, patient-controlled access consent sovereignty, real-time audit trails, and automated insurance claim adjudication.

---

## ✨ Key Features

- **Patient Module**: Self-registration, Curve25519 X25519 asymmetric encryption keypair generation, profile management, active consent management, and chronological clinical history timeline.
- **Doctor Module**: Specialist directory, patient roster management, complete EMR encounters viewing, clinical notes, and prescription issuance.
- **Electronic Medical Records (EMR)**: Multi-encounter clinical record manager with vital signs tracking, diagnosis, symptoms, clinical notes, JSON serialization, automated SHA-256 hashing, and Ganache blockchain anchoring.
- **Enterprise Security & Auth**: Stateless JWT authentication with 15-minute lifetimes, 7-day cryptographically secure refresh tokens, Token Revocation, `httpOnly` cookies, strict CORS, and global rate limiting.
- **Zero-Trust Encryption (KMS)**: Streaming AES-256 encryption featuring rotating 'Magic Byte' headers (`KMS\x01`) and unique Initialization Vectors (IV) per file.
- **Blockchain Verification Engine**: On-chain anchoring via Solidity smart contract (`EMRRegistry.sol`), storing record types, patient IDs, cryptographic hashes, and IPFS CIDs while preventing record tampering.
- **QR Verification Module**: Instant QR code scanning & public verification of medical certificates, HMAC proof hashes, and on-chain blockchain transaction hashes.
- **Insurance Adjudication Module**: Claim submission, 1-click certificate verification, 1-click blockchain hash verification, and claim approval/rejection adjudication.
- **Consent Management Module**: Patient-controlled access sovereignty enforcing active consent checks (`hasActiveConsent`) before returning clinical data to doctors or insurance providers.
- **Universal Audit Logging Engine**: Non-blocking background audit trail recording User, Action, Timestamp, IP Address, Blockchain Transaction Hash, and Data Hash backed by a Redis retry queue.

---

## 🛠 Technologies Used

### Frontend
- **React v18** (Vite build toolchain)
- **Material UI (MUI) v5** (Responsive component library & custom theme)
- **React Router v6** (Nested route management)

### Backend
- **Node.js** (JavaScript runtime) & **Express.js** (REST API framework)
- **JSON Web Tokens (JWT)** (Session authentication)
- **TweetNaCl / Node-Forge** (Asymmetric Curve25519 & HMAC cryptography)

### Database & Storage
- **MongoDB** (NoSQL document database)
- **Mongoose ORM** (Object Data Modeling)
- **IPFS Daemon HTTP API v0** (Decentralized file storage gateway)

### Blockchain & Smart Contracts
- **Solidity ^0.8.0** (Smart contract programming language)
- **Ganache** (Ethereum local RPC testnet)
- **Ethers.js v6** (Blockchain RPC wallet and contract interaction library)

---

## 🚀 Installation & Setup Guide

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **MongoDB** (Running locally on port `27017`)
- **Ganache** (Running locally on port `7545`)

### 2. Step-by-Step Installation

#### Step 1: Install Dependencies
```bash
# Backend
cd project/backend
npm install

# Frontend
cd ../certificate-portal
npm install
```

#### Step 2: Setup Environment Variables
Create `.env` inside `project/backend`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/certificate-portal
JWT_SECRET=super_secret_jwt_key_medichain_2026
RPC_URL=http://127.0.0.1:7545
CONTRACT_ADDRESS=<YOUR_DEPLOYED_CONTRACT_ADDRESS>
PRIVATE_KEY=<YOUR_GANACHE_PRIVATE_KEY>
IPFS_NODE_URL=http://127.0.0.1:5001/api/v0/add
```

#### Step 3: Start Ganache & Deploy Contract
1. Start Ganache on `http://127.0.0.1:7545`.
2. Compile and deploy `backend/contracts/EMRRegistry.sol` using Remix IDE.
3. Update `CONTRACT_ADDRESS` and `PRIVATE_KEY` in your `.env` file.

#### Step 4: Launch Applications
```bash
# Launch Backend Server (Runs on port 5000)
cd project/backend
npm run dev

# Launch Frontend Portal (Runs on port 5173)
cd project/certificate-portal
npm run dev
```

---

## 📜 Smart Contract Specification (`EMRRegistry.sol`)

The `EMRRegistry` contract is a unified solution acting as an on-chain ledger for both legacy batch hashes and detailed EMR clinical encounters. It provides immutability and instant verification for stored hashes.

Key Functions:
- `storeHash(string memory _batchHash)`: Legacy method to anchor simple batch hashes.
- `storeEMRRecord(...)`: Advanced method to anchor complete patient encounters (MedicalRecords, LabReports) including IPFS CIDs and data hashes. Automatically triggers legacy events for backward compatibility.
- `verifyRecordHash(...)`: Verifies if a specific data hash exists on-chain and retrieves its exact timestamp and owner.

---

## 🐛 Troubleshooting

### 1. `Contract not deployed to detected network` or Blockchain Connection Fails
- **Solution**: Verify Ganache is running on `http://127.0.0.1:7545` and check that your `CONTRACT_ADDRESS` in `.env` matches the newly deployed contract from Remix. Ensure your `PRIVATE_KEY` has enough funds (ETH) in Ganache.

### 2. EMR Manager Page is Blank / Crashing
- **Solution**: This usually means a missing component import (like `Tooltip`). Make sure your frontend dependencies are fully installed and you have the latest code pulled.

### 3. `Access Denied: Patient active consent is required`
- **Solution**: Log in as the Patient, navigate to **Consent Controls**, and click **Grant Doctor Access** for the attending doctor.

---

## 📄 License

This project is licensed under the **MIT License**.
