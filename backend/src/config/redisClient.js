const redis = require('redis');

const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 3) {
                return new Error('Max retries reached');
            }
            return Math.min(retries * 50, 500);
        }
    }
});

redisClient.on('error', (err) => {
    console.warn('Redis connection error. Caching will be bypassed:', err.message);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis server.');
});

let isConnected = false;

const connectRedis = async () => {
    if (!isConnected) {
        try {
            await redisClient.connect();
            isConnected = true;
        } catch (error) {
            console.warn('Failed to connect to Redis on startup. Caching is disabled.');
        }
    }
};

module.exports = {
    redisClient,
    connectRedis,
    get isConnected() {
        return redisClient.isOpen;
    }
};
