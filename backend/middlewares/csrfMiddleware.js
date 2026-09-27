/**
 * Anti-CSRF Middleware
 * 
 * Provides defense-in-depth against Cross-Site Request Forgery (CSRF).
 * Because authentication relies on HttpOnly cookies with SameSite=Strict,
 * the platform is largely protected from external cross-origin CSRF.
 * However, to mitigate Subdomain CSRF (where an attacker compromises a sibling subdomain),
 * this middleware explicitly verifies the Origin or Referer header against the allowedOrigins list
 * for all state-changing requests.
 */

const getAllowedOrigins = () => {
    return process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
};

const csrfMiddleware = (req, res, next) => {
    // Only apply to state-changing requests
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    const allowedOrigins = getAllowedOrigins();

    // Check Origin header first, fallback to Referer
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    let requestOrigin = null;

    if (origin) {
        requestOrigin = origin;
    } else if (referer) {
        try {
            const refererUrl = new URL(referer);
            requestOrigin = refererUrl.origin;
        } catch (e) {
            // Invalid referer URL
        }
    }

    if (!requestOrigin) {
        // If neither header is present, it's highly suspicious for a browser-based state-changing request.
        // However, some legitimate API clients (like mobile apps) might omit them.
        // Given Kyllang is a web app using cookies, browsers ALWAYS send Origin for cross-origin POSTs,
        // and usually send Origin or Referer for same-origin POSTs.
        // We will reject missing origins to be strictly secure against blind CSRF.
        return res.status(403).json({
            success: false,
            message: 'CSRF Protection: Missing Origin or Referer header.',
            error: 'Missing Origin or Referer header'
        });
    }

    if (!allowedOrigins.includes(requestOrigin)) {
        console.warn(`[CSRF WARNING] Blocked state-changing request from unauthorized origin: ${requestOrigin}`);
        return res.status(403).json({
            success: false,
            message: 'CSRF Protection: Unauthorized cross-origin request.',
            error: 'Unauthorized origin'
        });
    }

    next();
};

module.exports = {
    csrfMiddleware,
    getAllowedOrigins
};
