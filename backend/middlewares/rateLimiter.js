const rateLimit = require('express-rate-limit');

/**
 * createLimiter
 * @description Handles operations for createLimiter. Explains parameters, return values and usage.
 * @param {*} windowMs - windowMs parameter
 * @param {*} max - max parameter
 * @param {*} message - message parameter
 * @returns {*} Return value
 */
const createLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: {
            success: false,
            message: message || 'Too many requests from this IP, please try again later.'
        }
    });
};

// Login Limiter: 500 requests per 15 minutes
exports.loginLimiter = createLimiter(
    15 * 60 * 1000, 
    500, 
    'Too many login attempts from this IP, please try again after 15 minutes.'
);

// Register Limiter: 300 requests per 1 hour
exports.registerLimiter = createLimiter(
    60 * 60 * 1000, 
    300, 
    'Too many accounts created from this IP, please try again after an hour.'
);

// Upload Limiter: 1000 requests per 15 minutes
exports.uploadLimiter = createLimiter(
    15 * 60 * 1000, 
    1000, 
    'Too many file uploads from this IP, please try again after 15 minutes.'
);

// Verify Limiter: 3000 requests per 15 minutes
exports.verifyLimiter = createLimiter(
    15 * 60 * 1000, 
    3000, 
    'Too many verification requests from this IP, please try again after 15 minutes.'
);

// Download Limiter: 2000 requests per 15 minutes
exports.downloadLimiter = createLimiter(
    15 * 60 * 1000, 
    2000, 
    'Too many download requests from this IP, please try again after 15 minutes.'
);

// Certificate Verify Limiter: 2000 requests per 15 minutes
exports.certificateVerifyLimiter = createLimiter(
    15 * 60 * 1000, 
    2000, 
    'Too many certificate verification requests from this IP, please try again after 15 minutes.'
);
