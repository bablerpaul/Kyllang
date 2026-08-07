const { redisClient } = require('../config/redisClient');

/**
 * Express middleware to cache responses in Redis
 * @param {string} prefix - The prefix for the cache key
 * @param {number} duration - Cache duration in seconds
 */
const cacheRoute = (prefix, duration = 3600) => {
    return async (req, res, next) => {
        if (!redisClient.isOpen) {
            return next(); // Skip caching if Redis is not connected
        }

        try {
            // Generate dynamic cache key based on route and params/body/user
            let keySuffix = '';
            if (req.user && req.user._id) {
                keySuffix = req.user._id.toString();
            } else if (req.body && req.body.hash) {
                keySuffix = req.body.hash;
            } else if (req.params && Object.keys(req.params).length > 0) {
                keySuffix = Object.values(req.params).join('_');
            } else {
                keySuffix = req.originalUrl; // fallback
            }

            const cacheKey = `${prefix}:${keySuffix}`;

            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return res.status(200).json(JSON.parse(cachedData));
            }

            // Override res.json to capture the response and cache it
            const originalJson = res.json.bind(res);
            res.json = (body) => {
                // Only cache successful responses
                if (body && body.success) {
                    redisClient.setEx(cacheKey, duration, JSON.stringify(body)).catch(err => {
                        console.error('Redis Cache Error:', err);
                    });
                }
                return originalJson(body);
            };

            next();
        } catch (error) {
            console.error('Redis cache middleware error:', error);
            next();
        }
    };
};

/**
 * Utility to invalidate a specific cache key
 * @param {string} prefix - The prefix for the cache key
 * @param {string} suffix - The dynamic suffix (e.g., userId)
 */
const invalidateCache = async (prefix, suffix) => {
    if (!redisClient.isOpen) return;
    try {
        const cacheKey = `${prefix}:${suffix}`;
        await redisClient.del(cacheKey);
    } catch (error) {
        console.error('Redis invalidation error:', error);
    }
};

module.exports = {
    cacheRoute,
    invalidateCache
};
