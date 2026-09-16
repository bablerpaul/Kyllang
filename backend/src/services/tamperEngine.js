const MedicalRecord = require('../../models/MedicalRecord');
const { generateRecordCommitment, buildIntegrityPayload, generateIntegrityHash } = require('../utils/canonicalize');
const blockchain = require('../../blockchain');
const { logAudit } = require('../../utils/auditLogger');

class TamperEngine {
    static async verifyRecordIntegrity(recordId) {
        let record;
        try {
            const doc = await MedicalRecord.findById(recordId);
            record = doc ? doc.toJSON() : null;
        } catch (err) {
            return {
                success: false,
                status: 'VERIFICATION_ERROR'
            };
        }

        if (!record) {
            return {
                success: false,
                status: 'RECORD_NOT_FOUND'
            };
        }

        // Canonicalize and generate hash locally
        const payload = buildIntegrityPayload(record);
        const { canonicalize } = require('../utils/canonicalize');
        console.log("TAMPER_ENGINE CANONICAL STR:", canonicalize({
            data: payload,
            version: record.integrityVersion || 1,
            previousHash: record.previousIntegrityHash || null
        }));
        
        const calculatedHash = generateIntegrityHash(payload, record.integrityVersion || 1, record.previousIntegrityHash || null);

        // 1. Local Database Hash Check
        if (calculatedHash !== record.integrityHash) {
            await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
            return {
                success: false,
                status: 'TAMPER_DETECTED',
                reason: 'LOCAL_HASH_MISMATCH',
                recordVersion: record.integrityVersion,
                calculatedHash,
                storedHash: record.integrityHash,
                verifiedAt: new Date().toISOString()
            };
        }

        // 2. Blockchain Fetch
        const recordCommitmentHex = generateRecordCommitment(recordId);
        const recordCommitment = `0x${recordCommitmentHex}`;

        let blockchainVersion, blockchainHash;
        try {
            const [v, h] = await blockchain.getLatestRecordState(recordCommitment);
            blockchainVersion = Number(v);
            blockchainHash = h.replace('0x', '');
        } catch (err) {
            // Check if network error vs execution error
            return {
                success: false,
                status: 'BLOCKCHAIN_UNAVAILABLE'
            };
        }

        if (blockchainVersion === 0 || !blockchainHash) {
            return {
                success: true,
                status: 'ANCHOR_NOT_FOUND',
                recordVersion: record.integrityVersion,
                calculatedHash,
                verifiedAt: new Date().toISOString()
            };
        }

        // 3. Version Comparison
        const dbVersion = record.integrityVersion || 1;

        if (dbVersion < blockchainVersion) {
            await this._logAudit(recordId, 'ROLLBACK_DETECTED', calculatedHash);
            return {
                success: false,
                status: 'VERSION_MISMATCH',
                reason: 'ROLLBACK_DETECTED',
                recordVersion: dbVersion,
                blockchainVersion,
                calculatedHash,
                verifiedAt: new Date().toISOString()
            };
        }

        if (dbVersion > blockchainVersion) {
            return {
                success: true,
                status: 'ANCHOR_PENDING',
                recordVersion: dbVersion,
                blockchainVersion,
                calculatedHash,
                verifiedAt: new Date().toISOString()
            };
        }

        // dbVersion === blockchainVersion
        // 4. Hash Comparison
        if (calculatedHash !== blockchainHash) {
            await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
            return {
                success: false,
                status: 'TAMPER_DETECTED',
                reason: 'BLOCKCHAIN_HASH_MISMATCH',
                recordVersion: dbVersion,
                blockchainVersion,
                calculatedHash,
                blockchainHash,
                storedHash: record.integrityHash,
                verifiedAt: new Date().toISOString()
            };
        }

        if (record.integrityHash !== blockchainHash) {
            await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
            return {
                success: false,
                status: 'TAMPER_DETECTED',
                reason: 'STORED_HASH_MISMATCH',
                recordVersion: dbVersion,
                blockchainVersion,
                calculatedHash,
                blockchainHash,
                storedHash: record.integrityHash,
                verifiedAt: new Date().toISOString()
            };
        }

        // 5. Previous Hash Verification (O(1) historical lookup)
        const currentVersion = dbVersion;
        
        let currentChainPrevHash;
        try {
            const [, v, , ph] = await blockchain.getIntegrityAnchor(recordCommitment, currentVersion);
            if (Number(v) !== currentVersion) {
                return { success: false, status: 'TAMPER_DETECTED', reason: 'ANCHOR_NOT_FOUND', recordVersion: dbVersion };
            }
            currentChainPrevHash = ph.replace('0x', '');
        } catch (err) {
            return {
                success: false,
                status: 'BLOCKCHAIN_UNAVAILABLE'
            };
        }

        if (currentVersion > 1) {
            let previousChainHash;
            try {
                const [, prevV, ih] = await blockchain.getIntegrityAnchor(recordCommitment, currentVersion - 1);
                if (Number(prevV) !== currentVersion - 1) {
                    await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
                    return {
                        success: false,
                        status: 'TAMPER_DETECTED',
                        reason: 'PREVIOUS_ANCHOR_MISSING',
                        recordVersion: dbVersion,
                        blockchainVersion,
                        calculatedHash,
                        blockchainHash,
                        verifiedAt: new Date().toISOString()
                    };
                }
                previousChainHash = ih.replace('0x', '');
            } catch (err) {
                return {
                    success: false,
                    status: 'BLOCKCHAIN_UNAVAILABLE'
                };
            }
            
            if (currentChainPrevHash !== previousChainHash || record.previousIntegrityHash !== previousChainHash) {
                await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
                return {
                    success: false,
                    status: 'TAMPER_DETECTED',
                    reason: 'PREVIOUS_HASH_MISMATCH',
                    recordVersion: dbVersion,
                    blockchainVersion,
                    calculatedHash,
                    blockchainHash,
                    verifiedAt: new Date().toISOString()
                };
            }
        } else {
            // Version 1
            const expectedZeroHash = '0000000000000000000000000000000000000000000000000000000000000000';
            if (record.previousIntegrityHash || currentChainPrevHash !== expectedZeroHash) {
                await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
                return {
                    success: false,
                    status: 'TAMPER_DETECTED',
                    reason: 'PREVIOUS_HASH_MISMATCH', // Should be null/empty for v1
                    recordVersion: dbVersion,
                    blockchainVersion,
                    calculatedHash,
                    blockchainHash,
                    verifiedAt: new Date().toISOString()
                };
            }
        }

        // 6. Attachment Physical Integrity Check
        if (record.attachments && record.attachments.length > 0) {
            const fs = require('fs');
            const crypto = require('crypto');
            const path = require('path');
            const ipfsService = require('../utils/ipfsService');
            
            for (let i = 0; i < record.attachments.length; i++) {
                const att = record.attachments[i];
                if (!att.fileHash) continue;
                
                let stream;
                try {
                    if (att.ipfsCid) {
                        stream = await ipfsService.fetchStreamFromIPFS(att.ipfsCid);
                    } else if (att.fileUrl) {
                        let localPath;
                        if (att.fileUrl.startsWith('/api/')) {
                            const filename = att.fileUrl.split('/').pop();
                            localPath = path.join(__dirname, '..', '..', 'uploads', 'emr', filename);
                        } else {
                            localPath = path.resolve(att.fileUrl);
                        }
                        stream = fs.createReadStream(localPath);
                        // Add error handler to prevent crashing if file missing
                        stream.on('error', () => {});
                    } else {
                        continue;
                    }
                    
                    const calculatedFileHash = await new Promise((resolve, reject) => {
                        const hash = crypto.createHash('sha256');
                        stream.on('error', err => reject(err));
                        stream.on('data', chunk => hash.update(chunk));
                        stream.on('end', () => resolve(hash.digest('hex')));
                    });
                    
                    if (calculatedFileHash !== att.fileHash) {
                        await this._logAudit(recordId, 'TAMPER_DETECTED', calculatedHash);
                        return {
                            success: false,
                            status: 'TAMPER_DETECTED',
                            reason: 'ATTACHMENT_HASH_MISMATCH',
                            recordVersion: dbVersion,
                            verifiedAt: new Date().toISOString()
                        };
                    }
                } catch (err) {
                    return {
                        success: false,
                        status: 'ATTACHMENT_UNAVAILABLE',
                        recordVersion: dbVersion,
                        verifiedAt: new Date().toISOString()
                    };
                }
            }
        }

        await this._logAudit(recordId, 'INTEGRITY_VERIFICATION', calculatedHash);
        return {
            success: true,
            status: 'INTEGRITY_VERIFIED',
            recordVersion: dbVersion,
            blockchainVersion,
            calculatedHash,
            blockchainHash,
            verifiedAt: new Date().toISOString()
        };
    }

    static async _logAudit(recordId, action, hash) {
        try {
            const recordCommitment = generateRecordCommitment(recordId);
            await logAudit({
                userId: null, // System-level action, or handled by middleware externally
                action: action,
                resource: 'MedicalRecordIntegrity',
                resourceId: recordId,
                hash: hash,
                details: {
                    recordCommitment
                }
            });
        } catch (e) {
            console.error("Failed to log integrity audit", e);
        }
    }
}

module.exports = TamperEngine;
