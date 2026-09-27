import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { apiFetch } from './api';

const DB_NAME = 'kyllang_patient_key_vault';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
// Pre-T10-L8-R2 single, account-less slot. Still READ (never written, migrated or deleted): a record here is used only
// after its derived public key has been verified against the current account's server key.
const LEGACY_KEY_ID = 'patient-x25519';
const PBKDF2_ITERATIONS = 210000;

// One slot per account (User._id — the identity AuthContext exposes as `userId`), so one patient's key can never be
// read as another patient's key on a shared browser.
const slotFor = (userId) => `${LEGACY_KEY_ID}:${userId}`;

// Local key states reported by getLocalKeyStatus().
export const KEY_STATUS = {
    UNREGISTERED: 'unregistered',        // server has no public key → first enrollment
    MATCH: 'match',                      // this browser holds the key registered on the server
    MISMATCH: 'mismatch',                // this browser holds a key for this account, but not the registered one
    MISSING: 'missing',                  // server has a key, this browser has none for this account
    LEGACY_UNVERIFIED: 'legacy_unverified', // only a pre-R2 account-less key exists; unverifiable without the passphrase
};

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getRecord(db, id) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function putRecord(db, record) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

async function deriveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function decryptRecord(record, passphrase) {
    const key = await deriveKey(passphrase, record.salt);
    let decrypted;
    try {
        decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
    } catch (_) {
        throw new Error('Incorrect passphrase or corrupted vault entry.');
    }
    return new TextDecoder().decode(decrypted);
}

// Public half of a base64 X25519 secret key. The secret never leaves this function's caller.
const publicKeyOf = (privateKeyBase64) =>
    util.encodeBase64(nacl.box.keyPair.fromSecretKey(util.decodeBase64(privateKeyBase64)).publicKey);

// The signed-in account (User._id + registered public key) from the existing /api/auth/me endpoint.
async function currentAccount() {
    const res = await apiFetch('/api/auth/me');
    const user = res?.data || res;
    if (!user?._id) throw new Error('Could not determine the signed-in account.');
    return { userId: String(user._id), serverPublicKey: user.publicKey || null };
}

/**
 * Store the account's private key, encrypted (PBKDF2 → AES-GCM, unchanged), in this account's own slot together with
 * its non-secret public key. A record already in the slot is never overwritten: it is kept under a `:superseded:`
 * id so a previous key is not silently destroyed.
 * @param {string} privateKey base64 X25519 secret key
 * @param {string} passphrase
 * @param {{ userId?: string }} [opts] defaults to the signed-in account
 */
export async function storePatientPrivateKey(privateKey, passphrase, { userId } = {}) {
    const owner = String(userId || (await currentAccount()).userId);
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(privateKey),
    );
    const db = await openDB();
    const existing = await getRecord(db, slotFor(owner));
    if (existing) {
        await putRecord(db, { ...existing, id: `${slotFor(owner)}:superseded:${existing.createdAt || Date.now()}` });
    }
    await putRecord(db, {
        id: slotFor(owner),
        userId: owner,
        publicKey: publicKeyOf(privateKey),
        ciphertext,
        iv,
        salt,
        createdAt: Date.now(),
    });
}

/**
 * Decrypt the signed-in account's private key — only if it is the key currently registered on the server.
 * A pre-R2 legacy record is accepted only when its derived public key equals the server key (never migrated/deleted).
 * @param {string} passphrase
 * @param {{ userId?: string, serverPublicKey?: string }} [opts] defaults to the signed-in account
 * @returns {Promise<string>} base64 private key
 */
export async function retrievePatientPrivateKey(passphrase, opts = {}) {
    const account = opts.userId && opts.serverPublicKey !== undefined ? opts : await currentAccount();
    const userId = String(account.userId);
    const serverPublicKey = account.serverPublicKey;
    if (!serverPublicKey) throw new Error('No encryption key is registered for your account. Please set up your encryption key first.');

    const db = await openDB();
    const record = await getRecord(db, slotFor(userId));
    if (record) {
        if (record.userId !== userId) throw new Error('The key in this browser belongs to a different account.');
        if (record.publicKey !== serverPublicKey) {
            throw new Error('The encryption key stored in this browser does not match the key registered for your account. It will not be used.');
        }
        const privateKey = await decryptRecord(record, passphrase);
        if (publicKeyOf(privateKey) !== serverPublicKey) throw new Error('Vault entry is inconsistent with its recorded public key.');
        return privateKey;
    }

    const legacy = await getRecord(db, LEGACY_KEY_ID);
    if (!legacy) throw new Error('No private key for your account was found in this browser.');
    const privateKey = await decryptRecord(legacy, passphrase);
    if (publicKeyOf(privateKey) !== serverPublicKey) {
        throw new Error('The encryption key stored in this browser does not match the key registered for your account. It will not be used.');
    }
    return privateKey;
}

/**
 * Compare this browser's key for the account with the server's registered public key. Never decrypts anything and never
 * touches key material — only the stored (non-secret) public key is compared.
 * @param {string} userId User._id of the signed-in account
 * @param {string|null} serverPublicKey the account's registered public key (from /api/auth/me)
 * @returns {Promise<string>} one of KEY_STATUS
 */
export async function getLocalKeyStatus(userId, serverPublicKey) {
    if (!serverPublicKey) return KEY_STATUS.UNREGISTERED;
    const db = await openDB();
    const record = await getRecord(db, slotFor(String(userId)));
    if (record && record.userId === String(userId) && record.publicKey) {
        return record.publicKey === serverPublicKey ? KEY_STATUS.MATCH : KEY_STATUS.MISMATCH;
    }
    const legacy = await getRecord(db, LEGACY_KEY_ID);
    return legacy ? KEY_STATUS.LEGACY_UNVERIFIED : KEY_STATUS.MISSING;
}
