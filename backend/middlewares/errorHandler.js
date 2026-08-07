/**
 * errorHandler
 * @description Handles operations for errorHandler. Explains parameters, return values and usage.
 * @param {Error} err - The error object
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {*} Return value
 */
const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    if (err.statusCode) {
        statusCode = err.statusCode;
    }

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'production' ? null : err.stack,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
};

module.exports = errorHandler;
