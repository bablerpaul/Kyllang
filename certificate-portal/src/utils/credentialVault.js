/**
 * credentialVault.js — Patient Local Credential Vault
 *
 * Stores and retrieves ZK certificate credentials from IndexedDB,
 * encrypted with a key derived from the user's passphrase via Argon2id
 * (OWASP-recommended parameters: memory=65536, iterations=3, parallelism=4).
 *
 * Architecture:
 *   • Each credential set is encrypted with AES-256-GCM
 *   • The AES key is derived via PBKDF2 + a per-record 32-byte cryptographic salt
 *     (Argon2id WASM is ideal; PBKDF2 used here for pure-browser compatibility)
 *   • The salt and IV are stored alongside the ciphertext in IndexedDB
 *   • Raw credentials NEVER persist to localStorage or sessionStorage
 *
 * Vault record format (IndexedDB):
 *   {
 *     id:            string        (commitmentHash — unique per certificate)
 *     ciphertext:    ArrayBuffer   (AES-256-GCM encrypted JSON)
 *     iv:            Uint8Array    (12-byte GCM nonce)
 *     kdfSalt:       Uint8Array    (32-byte PBKDF2 salt)
 *     createdAt:     number        (timestamp)
 *   }
 *
 * Decrypted credential format:
 *   {
 *     patientId:     string
 *     diagnosisCode: string
 *     validFrom:     number  (unix timestamp)
 *     secretSalt:    string  (62-char hex, 248-bit)
 *     commitment:    string  (decimal Poseidon hash)
 *     validUntil:    number
 *     issuer:        string
 *   }
 */

const DB_NAME    = 'kyllang_credential_vault';
const DB_VERSION = 1;
const STORE_NAME = 'credentials';
const PBKDF2_ITER= 210_000; // OWASP 2023 recommendation for PBKDF2-SHA256

// ── IndexedDB Helpers ──────────────────────────────────────────────────────

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

function dbGet(db, key) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror   = (e) => reject(e.target.error);
    });
}

function dbPut(db, record) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(record);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
    });
}

function dbGetAll(db) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = (e) => resolve(e.target.result || []);
        req.onerror   = (e) => reject(e.target.error);
    });
}

function dbDelete(db, key) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(key);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
    });
}

// ── KDF + AES-GCM ─────────────────────────────────────────────────────────

async function deriveKey(passphrase, salt) {
    const enc     = new TextEncoder();
    const keyMat  = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
        keyMat,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptCredential(credential, passphrase) {
    const kdfSalt = crypto.getRandomValues(new Uint8Array(32));
    const iv      = crypto.getRandomValues(new Uint8Array(12));
    const key     = await deriveKey(passphrase, kdfSalt);
    const enc     = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(JSON.stringify(credential))
    );
    return { ciphertext, iv, kdfSalt };
}

async function decryptCredential(record, passphrase) {
    const key = await deriveKey(passphrase, record.kdfSalt);
    const dec = new TextDecoder();
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: record.iv },
        key,
        record.ciphertext
    );
    return JSON.parse(dec.decode(plaintext));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Store a credential in the vault, encrypted with the user's passphrase.
 *
 * @param {object} credential  { patientId, diagnosisCode, validFrom, secretSalt, commitment, ... }
 * @param {string} passphrase  User's secret passphrase (min 12 chars recommended)
 */
export async function storeCredential(credential, passphrase) {
    if (!credential?.commitment) throw new Error('Credential must have a commitment field');
    const { ciphertext, iv, kdfSalt } = await encryptCredential(credential, passphrase);
    const db = await openDB();
    await dbPut(db, {
        id:        credential.commitment,
        ciphertext,
        iv,
        kdfSalt,
        createdAt: Date.now(),
        // Non-sensitive display metadata (not encrypted)
        validFrom:  credential.validFrom,
        validUntil: credential.validUntil,
    });
}

/**
 * Retrieve and decrypt a credential from the vault.
 *
 * @param {string} commitmentHash  Decimal or hex commitment hash
 * @param {string} passphrase
 * @returns {Promise<object|null>} Decrypted credential or null if not found
 */
export async function getCredential(commitmentHash, passphrase) {
    const db     = await openDB();
    const record = await dbGet(db, commitmentHash);
    if (!record) return null;
    try {
        return await decryptCredential(record, passphrase);
    } catch (_) {
        throw new Error('Wrong passphrase or corrupted vault entry');
    }
}

/**
 * List all vault entries (non-sensitive metadata only — commitment hashes and dates).
 */
export async function listCredentials() {
    const db      = await openDB();
    const records = await dbGetAll(db);
    return records.map(r => ({
        id:        r.id,
        validFrom: r.validFrom,
        validUntil:r.validUntil,
        createdAt: r.createdAt,
    }));
}

/**
 * Delete a credential from the vault.
 */
export async function deleteCredential(commitmentHash) {
    const db = await openDB();
    await dbDelete(db, commitmentHash);
}

/**
 * Check if the vault has any stored credentials (without decrypting them).
 */
export async function hasCredentials() {
    const entries = await listCredentials();
    return entries.length > 0;
}
