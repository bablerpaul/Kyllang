const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect
 * @description Handles operations for protect. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const protect = async (req, res, next) => {
    let token;

    // 1. Check for token in secure cookie
    if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    } 
    // 2. Fallback to Bearer token in header (Backward Compatibility)
    else if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');

            // Get user from the token
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            return next();
        } catch (error) {
            console.error('[AuthMiddleware] Token verification failed:', error.message);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

/**
 * authorize
 * @description Handles operations for authorize. Explains parameters, return values and usage.
 * @param {*} param - param parameter
 * @returns {*} Return value
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
