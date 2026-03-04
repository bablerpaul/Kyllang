<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=900&size=48&duration=3000&pause=1000&color=FFFFFF&center=true&vCenter=true&width=500&height=80&lines=KYLLANG" alt="KYLLANG" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=300&size=14&duration=4000&pause=2000&color=888888&center=true&vCenter=true&width=450&height=30&lines=secure+medical+certificate+portal" alt="secure medical certificate portal" />
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Encryption-Curve25519-white?style=flat-square&labelColor=000000" alt="Curve25519" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Backend-Express.js-white?style=flat-square&labelColor=000000" alt="Express.js" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Frontend-React_Vite-white?style=flat-square&labelColor=000000" alt="React" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-white?style=flat-square&labelColor=000000" alt="MIT" /></a>
</p>

<br/>

<p align="center">
  <samp>Generate · Verify · Trust — secure medical certificates.</samp>
</p>

---

<br/>

## `>` About

<samp>
Kyllang is a full-stack secure medical certificate portal that enables doctors to issue patient certificates and authorities to verify them seamlessly. Built with a modern UI and role-based access control, it delivers a secure and efficient experience for managing healthcare credentials using Curve25519 cryptography and QR code ID cards.
</samp>

<br/><br/>

## `>` Features

<table>
  <tr>
    <td width="50%">
      <h3><samp>🔐 Certificate Issuance</samp></h3>
      <samp>Doctors can securely generate and issue certificates to patients. Export records as downloadable PDF certificates.</samp>
    </td>
    <td width="50%">
      <h3><samp>✅ Certificate Verification</samp></h3>
      <samp>Verify certificates securely. Upload Kyllang generated certificates or scan QR code ID cards to ensure authenticity.</samp>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3><samp>🌌 Role-Based UI</samp></h3>
      <samp>Clean, interactive dashboards designed specifically for Administrators, Doctors, and Patients.</samp>
    </td>
    <td width="50%">
      <h3><samp>⚡ REST API</samp></h3>
      <samp>Robust Express.js API for secure document management, user authentication, and cryptographic operations.</samp>
    </td>
  </tr>
</table>

<br/>

## `>` Tech Stack

```text
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   BACKEND              FRONTEND            CRYPTOGRAPHY      ║
║   ───────              ────────            ────────────      ║
║   Express.js           React 18            Curve25519        ║
║   Mongoose             Vite                TweetNaCl         ║
║   Node.js              Tailwind CSS        QR Code Auth      ║
║   JWT Authentication   jsPDF               node-forge        ║
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
| <samp>Node.js</samp> | `18+` |
| <samp>npm</samp> | `latest` |
| <samp>MongoDB</samp> | `Running Instance`|

</details>

<br/>

### <samp>Database Setup (MongoDB)</samp>

<details>
<summary><samp><b>🍃 Local Installation</b></samp></summary>

1. <samp>Download and install <b>MongoDB Community Server</b> from the <a href="https://www.mongodb.com/try/download/community">official website</a>.</samp>
2. <samp>Start the MongoDB service on your local machine.</samp>
3. <samp>Your default connection string will typically be `mongodb://localhost:27017/kyllang`.</samp>
4. <samp>Add this connection string to your backend `.env` file as `MONGO_URI`.</samp>

</details>

<details>
<summary><samp><b>☁️ MongoDB Atlas (Cloud)</b></samp></summary>

1. <samp>Create a free cluster on <a href="https://www.mongodb.com/cloud/atlas">MongoDB Atlas</a>.</samp>
2. <samp>Retrieve your connection string (URI) from the dashboard.</samp>
3. <samp>Replace `<password>` with your database user password.</samp>
4. <samp>Add this connection string to your backend `.env` file as `MONGO_URI`.</samp>

</details>

<br/>

### <samp>Backend</samp>

```bash
cd backend

# Install dependencies
npm install

# Setup environment variables 
# Create a .env file locally and add your MONGO_URI

# Launch development server
npm run dev
```

> <samp>API runs at</samp> **`http://localhost:5000`**

<br/>

### <samp>Frontend</samp>

```bash
cd certificate-portal

# Install dependencies
npm install

# Launch development server
npm run dev
```

> <samp>App runs at</samp> **`http://localhost:5173`**

<br/>

## `>` Key Workflows

<details>
<summary><samp><b>💳 QR Code ID Cards</b></samp></summary>

<samp>Patients access their securely encrypted records using ATM-sized ID cards containing dynamically generated QR codes, replacing raw cryptography keys for a better user experience.</samp>

</details>

<details>
<summary><samp><b>📄 Document Uploads</b></samp></summary>

<samp>Doctors upload medical certificates that serve as cryptographic commitments to the patient's records, subsequently stored safely offline or immutably.</samp>

</details>

<details>
<summary><samp><b>🔍 Verification Protocol</b></samp></summary>

<samp>Authorized entities can verify the authenticity of a Medical Certificate by uploading the digital document to the portal, ensuring data integrity.</samp>

</details>

<br/>

## `>` Project Structure

```text
kyllang/
├── backend/
│   ├── index.js              ← Express application entry
│   ├── models/               ← Mongoose schemas 
│   ├── routes/               ← API route handlers
│   ├── controllers/          ← Business logic and encryption
│   └── package.json
│
└── certificate-portal/
    ├── src/
    │   ├── App.jsx            ← Root React component & routing
    │   ├── components/        ← Shared UI & layouts
    │   ├── pages/             ← Admin, Doctor, and Patient dashboards
    │   └── contexts/          ← Auth and Data React contexts
    ├── package.json
    └── vite.config.js
```

<br/>

## `>` License

<samp>MIT — free to use, modify, and distribute.</samp>

---

<p align="center">
  <samp>built with precision · <b>kyllang</b></samp>
</p>
