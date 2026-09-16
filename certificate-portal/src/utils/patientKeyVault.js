const DB_NAME = 'kyllang_patient_key_vault';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'patient-x25519';
const PBKDF2_ITERATIONS = 210000;

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

export async function storePatientPrivateKey(privateKey, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(privateKey),
    );
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
            id: KEY_ID,
            ciphertext,
            iv,
            salt,
            createdAt: Date.now(),
        });
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

export async function retrievePatientPrivateKey(passphrase) {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    if (!record) throw new Error('No private key found in vault. Please set up your encryption key first.');
    const key = await deriveKey(passphrase, record.salt);
    let decrypted;
    try {
        decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: record.iv },
            key,
            record.ciphertext,
        );
    } catch (_) {
        throw new Error('Incorrect passphrase or corrupted vault entry.');
    }
    return new TextDecoder().decode(decrypted);
}

export async function hasStoredPrivateKey() {
    try {
        const db = await openDB();
        const record = await new Promise((resolve, reject) => {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return !!record;
    } catch (_) {
        return false;
    }
}
