import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { apiFetch } from './api';

/**
 * doctorKeyVault.js — the doctor's account-bound local X25519 key vault (browser only).
 *
 * Deliberately separate from patientKeyVault.js: its own IndexedDB database and one record per doctor account
 * (`doctor-x25519:<User._id>`) — there is no shared/legacy slot. Protection mirrors the patient vault exactly:
 * PBKDF2-SHA256 (210,000 iterations, random 32-byte salt) → AES-GCM-256 (random 12-byte IV). The passphrase is never
 * stored and the private key never leaves this module unencrypted; only the public key is sent to the server.
 *
 * Split-brain safety (server holds a key the browser cannot open): the encrypted private key is written locally as a
 * `pending` record BEFORE the public key is registered, and is promoted to `active` only after the server confirms it
 * holds exactly that key. A definite refusal (409 / 4xx) deletes the pending record; an unknown outcome (network
 * error / 5xx) keeps it so the SAME public key can be resubmitted later — never a new one — after re-entering the
 * original passphrase.
 *
 * retrieveDoctorPrivateKey() unlocks the signed-in doctor's own ACTIVE key for in-memory, client-side use only, after
 * proving it is the key registered for the account.
 */

const DB_NAME = 'kyllang_doctor_key_vault';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const PBKDF2_ITERATIONS = 210000; // same as patientKeyVault.js
export const MIN_PASSPHRASE_LENGTH = 12; // same rule as PatientKeyEnrollment

const slotFor = (userId) => `doctor-x25519:${userId}`;

export const DOCTOR_KEY_STATUS = {
    UNREGISTERED: 'unregistered', // server has no key and nothing is pending here → may enroll
    PENDING: 'pending',           // a local key exists but the server has not confirmed it → finish (same key) or discard
    MATCH: 'match',               // this browser holds the key registered on the server
    MISSING: 'missing',           // server has a key; this browser has none for this account
    MISMATCH: 'mismatch',         // this browser's key for this account is not the registered one
};

export class DoctorKeyError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

// ── IndexedDB ────────────────────────────────────────────────────────────────
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

function txRequest(db, mode, op) {
    return new Promise((resolve, reject) => {
        const request = op(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}
const getRecord = (db, id) => txRequest(db, 'readonly', (s) => s.get(id));
const putRecord = (db, record) => txRequest(db, 'readwrite', (s) => s.put(record));
const deleteRecord = (db, id) => txRequest(db, 'readwrite', (s) => s.delete(id));

// ── Crypto (parameters identical to patientKeyVault.js) ──────────────────────
async function deriveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
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
    try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
        return new TextDecoder().decode(plain);
    } catch (_) {
        throw new DoctorKeyError('WRONG_PASSPHRASE', 'Incorrect passphrase for the pending key.');
    }
}

const publicKeyOf = (privateKeyBase64) =>
    util.encodeBase64(nacl.box.keyPair.fromSecretKey(util.decodeBase64(privateKeyBase64)).publicKey);

// ── Account (from the authenticated session only) ────────────────────────────
async function currentDoctor() {
    const res = await apiFetch('/api/auth/me');
    const user = res?.data || res;
    if (!user?._id) throw new DoctorKeyError('NO_SESSION', 'Could not determine the signed-in account.');
    if (user.role !== 'doctor') throw new DoctorKeyError('NOT_DOCTOR', 'Only doctor accounts can set up a doctor encryption key.');
    return { userId: String(user._id), serverPublicKey: user.publicKey || null };
}

async function promote(db, record) {
    const active = { ...record, status: 'active', confirmedAt: Date.now() };
    await putRecord(db, active);
    return active;
}

/**
 * Compare this browser's key with the account's registered public key. Never decrypts anything.
 * A pending record whose public key the server now holds (e.g. the response to an earlier attempt was lost) is
 * promoted to active here.
 * @returns {Promise<{ status: string, userId: string }>}
 */
export async function getDoctorKeyStatus() {
    const { userId, serverPublicKey } = await currentDoctor();
    const db = await openDB();
    const record = await getRecord(db, slotFor(userId));
    const own = record && record.userId === userId ? record : null;

    if (serverPublicKey) {
        if (own && own.publicKey === serverPublicKey) {
            if (own.status !== 'active') await promote(db, own);
            return { status: DOCTOR_KEY_STATUS.MATCH, userId };
        }
        return { status: own ? DOCTOR_KEY_STATUS.MISMATCH : DOCTOR_KEY_STATUS.MISSING, userId };
    }
    return { status: own?.status === 'pending' ? DOCTOR_KEY_STATUS.PENDING : DOCTOR_KEY_STATUS.UNREGISTERED, userId };
}

const REJECTED_MESSAGES = {
    400: 'The server rejected the public key. Nothing was registered.',
    401: 'Your session has expired. Please sign in again. Nothing was registered.',
    403: 'This account is not allowed to register a doctor encryption key. Nothing was registered.',
};

/**
 * Register `record.publicKey` (and nothing else) and settle the pending record according to the outcome.
 */
async function submitPending(db, userId, record) {
    try {
        await apiFetch('/api/doctor/public-key', {
            method: 'PUT',
            body: JSON.stringify({ publicKey: record.publicKey }),
            redirectOnAuthFailure: false, // settle the pending record here instead of navigating away mid-enrollment
        });
    } catch (err) {
        const status = err?.status;
        if (status === 409 || (status && status < 500)) {
            // Definite outcome. The server may already hold THIS key (an earlier attempt succeeded) — check first.
            const { serverPublicKey } = await currentDoctor().catch(() => ({ serverPublicKey: null }));
            if (serverPublicKey && serverPublicKey === record.publicKey) return promote(db, record);
            await deleteRecord(db, record.id);
            if (status === 409) {
                throw new DoctorKeyError('ALREADY_ENROLLED', 'This account already has a registered encryption key. Nothing was changed.');
            }
            throw new DoctorKeyError('REJECTED', REJECTED_MESSAGES[status] || 'The server refused the enrollment. Nothing was registered.');
        }
        // Unknown outcome (network / 5xx): keep the pending record so the SAME key can be confirmed or resubmitted.
        const { serverPublicKey } = await currentDoctor().catch(() => ({ serverPublicKey: null }));
        if (serverPublicKey && serverPublicKey === record.publicKey) return promote(db, record);
        throw new DoctorKeyError('PENDING', 'The server did not confirm the enrollment. Your new key was kept in this browser; finish setup later with the same passphrase.');
    }

    // Success reported — confirm the server holds exactly this key before activating it locally.
    const { serverPublicKey } = await currentDoctor();
    if (serverPublicKey !== record.publicKey) {
        await deleteRecord(db, record.id);
        throw new DoctorKeyError('MISMATCH', 'The server reports a different encryption key for this account. Nothing was activated.');
    }
    return promote(db, record);
}

/**
 * First-time enrollment: generate an X25519 keypair in this browser, store the private key encrypted under the
 * passphrase as a pending record, register ONLY the public key, then activate.
 * Never overwrites a registered key; never sends the private key or passphrase anywhere.
 */
export async function enrollDoctorKey(passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new DoctorKeyError('WEAK_PASSPHRASE', `Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    const { userId, serverPublicKey } = await currentDoctor();
    if (serverPublicKey) {
        throw new DoctorKeyError('ALREADY_ENROLLED', 'This account already has a registered encryption key. Nothing was changed.');
    }

    const db = await openDB();
    const id = slotFor(userId);
    const existing = await getRecord(db, id);
    if (existing?.status === 'pending') {
        throw new DoctorKeyError('PENDING_EXISTS', 'An earlier setup is not finished. Finish it with the same passphrase, or discard it first.');
    }
    if (existing) {
        // An active local key the server no longer knows about — keep it rather than destroy it.
        await putRecord(db, { ...existing, id: `${id}:superseded:${existing.createdAt || Date.now()}` });
    }

    let privateKey = null;
    let record;
    try {
        const keyPair = nacl.box.keyPair();
        privateKey = util.encodeBase64(keyPair.secretKey);
        const publicKey = util.encodeBase64(keyPair.publicKey);
        keyPair.secretKey.fill(0);
        if (publicKeyOf(privateKey) !== publicKey) throw new DoctorKeyError('KEYGEN', 'Key generation self-check failed.');

        const salt = crypto.getRandomValues(new Uint8Array(32));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(privateKey));
        record = { id, userId, publicKey, ciphertext, iv, salt, createdAt: Date.now(), status: 'pending' };
        await putRecord(db, record);
    } finally {
        privateKey = null;
    }

    await submitPending(db, userId, record);
    return { status: DOCTOR_KEY_STATUS.MATCH };
}

/**
 * Finish an interrupted enrollment with the SAME key. The original passphrase must unlock the pending record (so the
 * doctor can actually use the key later) and the decrypted key must match the recorded public key.
 */
export async function resumeDoctorKeyEnrollment(passphrase) {
    const { userId, serverPublicKey } = await currentDoctor();
    const db = await openDB();
    const record = await getRecord(db, slotFor(userId));
    if (!record || record.userId !== userId || record.status !== 'pending') {
        throw new DoctorKeyError('NO_PENDING', 'There is no unfinished setup to complete.');
    }

    let privateKey = await decryptRecord(record, passphrase);
    const consistent = publicKeyOf(privateKey) === record.publicKey;
    privateKey = null;
    if (!consistent) throw new DoctorKeyError('CORRUPT', 'The pending key is inconsistent and cannot be used.');

    if (serverPublicKey) {
        if (serverPublicKey === record.publicKey) {
            await promote(db, record);
            return { status: DOCTOR_KEY_STATUS.MATCH };
        }
        await deleteRecord(db, record.id);
        throw new DoctorKeyError('ALREADY_ENROLLED', 'This account already has a different registered key. The unfinished key was discarded.');
    }
    await submitPending(db, userId, record);
    return { status: DOCTOR_KEY_STATUS.MATCH };
}

const UNLOCK_FAILED_MESSAGE = 'Your encryption key could not be unlocked. Check your passphrase, and that this browser holds the key registered for your account.';
const AES_GCM_TAG_BYTES = 16;

/**
 * Unlock the signed-in doctor's own private key from this browser's doctor vault.
 *
 * The account is taken only from the authenticated session (/api/auth/me) — the function deliberately accepts no
 * userId / doctorId / record id. It reads exactly `doctor-x25519:<that User._id>` (never the patient vault or any
 * shared/legacy record), requires an ACTIVE record, decrypts it with the same parameters used at enrollment
 * (PBKDF2-SHA256, 210,000 iterations, stored 32-byte salt → AES-GCM-256, stored 12-byte IV), and returns the base64
 * X25519 private key only if the public key derived from it equals BOTH the vault record's publicKey AND the account's
 * registered User.publicKey. It never writes anything (IndexedDB, web storage, network) and repairs nothing.
 *
 * Every key-related failure — no/foreign/inactive/malformed record, wrong passphrase, failed decryption, malformed or
 * mismatching key — raises the same UNLOCK_FAILED error, so the cause (e.g. the passphrase) is never revealed.
 * The caller must use the returned key transiently; JavaScript strings cannot be securely wiped, but the temporary
 * byte buffers used here are zeroed.
 *
 * @param {string} passphrase
 * @returns {Promise<string>} base64 X25519 private key
 */
export async function retrieveDoctorPrivateKey(passphrase) {
    const unlockFailed = () => new DoctorKeyError('UNLOCK_FAILED', UNLOCK_FAILED_MESSAGE);
    if (typeof passphrase !== 'string' || passphrase === '') throw unlockFailed();

    let account;
    try {
        account = await currentDoctor();
    } catch (err) {
        throw err instanceof DoctorKeyError ? err : new DoctorKeyError('NO_SESSION', 'Could not determine the signed-in account.');
    }
    const { userId, serverPublicKey } = account;
    if (!serverPublicKey) throw unlockFailed(); // no registered key → nothing this browser may vouch for

    let record;
    try {
        const db = await openDB();
        record = await getRecord(db, slotFor(userId));
    } catch (_) {
        throw unlockFailed();
    }

    const wellFormed = record
        && record.id === slotFor(userId)
        && record.userId === userId
        && record.status === 'active'
        && typeof record.publicKey === 'string'
        && record.salt instanceof Uint8Array && record.salt.length === 32
        && record.iv instanceof Uint8Array && record.iv.length === 12
        && (record.ciphertext instanceof ArrayBuffer || ArrayBuffer.isView(record.ciphertext))
        && record.ciphertext.byteLength > AES_GCM_TAG_BYTES;
    // The record must already claim the registered key before any decryption is attempted.
    if (!wellFormed || record.publicKey !== serverPublicKey) throw unlockFailed();

    let plainBytes = null;
    let secretBytes = null;
    let derivedKeyPair = null;
    try {
        const aesKey = await deriveKey(passphrase, record.salt);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, aesKey, record.ciphertext);
        plainBytes = new Uint8Array(plain);
        const privateKey = new TextDecoder().decode(plainBytes);

        secretBytes = util.decodeBase64(privateKey);
        if (secretBytes.length !== nacl.box.secretKeyLength) throw unlockFailed();

        // Prove the recovered secret is the key this browser and the server both name.
        derivedKeyPair = nacl.box.keyPair.fromSecretKey(secretBytes);
        const derivedPublicKey = util.encodeBase64(derivedKeyPair.publicKey);
        if (derivedPublicKey !== record.publicKey || derivedPublicKey !== serverPublicKey) throw unlockFailed();

        return privateKey;
    } catch (_) {
        throw unlockFailed(); // wrong passphrase, tampered/malformed data, or mismatch — never partial output
    } finally {
        plainBytes?.fill(0);
        secretBytes?.fill(0);
        derivedKeyPair?.secretKey.fill(0);
    }
}

/**
 * Discard an unfinished (pending) key. Refuses if the server holds exactly that key — it would then be the real one.
 */
export async function discardPendingDoctorKey() {
    const { userId, serverPublicKey } = await currentDoctor();
    const db = await openDB();
    const record = await getRecord(db, slotFor(userId));
    if (!record || record.userId !== userId || record.status !== 'pending') return;
    if (serverPublicKey && serverPublicKey === record.publicKey) {
        await promote(db, record);
        throw new DoctorKeyError('ALREADY_ENROLLED', 'That key was in fact registered, so it was kept.');
    }
    await deleteRecord(db, record.id);
}
