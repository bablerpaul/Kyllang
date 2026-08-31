const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VAULT_FILE = path.join(__dirname, '..', 'data', 'audit_vault.json');

class AuditVault {
    constructor() {
        this.store = new Map();
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(VAULT_FILE)) {
                const data = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8'));
                this.store = new Map(Object.entries(data));
            }
        } catch (e) {
            console.error("Failed to load vault:", e.message);
        }
    }

    _save() {
        try {
            if (!fs.existsSync(path.dirname(VAULT_FILE))) {
                fs.mkdirSync(path.dirname(VAULT_FILE), { recursive: true });
            }
            const data = Object.fromEntries(this.store);
            fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error("Failed to save vault:", e.message);
        }
    }

    /**
     * Stores an encrypted audit envelope
     * @param {string} auditId 
     * @param {string} sessionNonce 
     * @param {object} encryptedEnvelope { iv, ephemeralPublicKey, ciphertext, authTag }
     */
    storeEnvelope(auditId, sessionNonce, encryptedEnvelope) {
        this.store.set(auditId, {
            sessionNonce,
            encryptedEnvelope,
            timestamp: Date.now()
        });
        this._save();
        console.log(`[AuditVault] Securely stored encrypted envelope for Audit ID: ${auditId}`);
    }

    getEnvelope(auditId) {
        return this.store.get(auditId);
    }
}

module.exports = new AuditVault();
