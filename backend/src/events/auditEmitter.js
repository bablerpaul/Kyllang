const EventEmitter = require('events');
const AuditLog = require('../../models/AuditLog');
const { redisClient } = require('../config/redisClient'); 

class AuditEmitter extends EventEmitter {}
const auditEmitter = new AuditEmitter();

// In-memory queue as fallback when Redis is offline
const memoryRetryQueue = [];

auditEmitter.on('saveLog', async (auditData) => {
    try {
        await AuditLog.create(auditData);
    } catch (err) {
        console.error('Audit DB save failed, queuing for retry:', err.message);
        
        // Ensure Redis is defined and connected
        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.lPush('audit_retry_queue', JSON.stringify(auditData));
            } catch (redisErr) {
                console.error('Redis enqueue failed, falling back to memory queue', redisErr);
                memoryRetryQueue.push(auditData);
            }
        } else {
            memoryRetryQueue.push(auditData);
        }
    }
});

// Periodic Retry Worker (Runs every 10 seconds)
setInterval(async () => {
    // 1. Retry Memory Queue
    while (memoryRetryQueue.length > 0) {
        const auditData = memoryRetryQueue.shift();
        try {
            await AuditLog.create(auditData);
        } catch (err) {
            // Put it back at the front of the queue and abort memory retry for this cycle
            memoryRetryQueue.unshift(auditData); 
            break; 
        }
    }
    
    // 2. Retry Redis Queue
    if (redisClient && redisClient.isOpen) {
        try {
            let length = await redisClient.lLlen('audit_retry_queue');
            while (length > 0) {
                const dataStr = await redisClient.rPop('audit_retry_queue');
                if (!dataStr) break;
                
                try {
                    const auditData = JSON.parse(dataStr);
                    await AuditLog.create(auditData);
                } catch (err) {
                    // Failed again, push it back to the left (front) of the queue
                    await redisClient.lPush('audit_retry_queue', dataStr);
                    break; // Stop retrying if DB is still failing
                }
                length--;
            }
        } catch (err) {
            // Safely ignore Redis retry errors (e.g. connection drops mid-process)
        }
    }
}, 10000); 

module.exports = auditEmitter;
