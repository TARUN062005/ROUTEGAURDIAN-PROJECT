const crypto = require('crypto');

/**
 * csrfProtection: Middleware to validate XSRF-TOKEN cookie against the custom X-XSRF-TOKEN header.
 */
const csrfProtection = (req, res, next) => {
  // Safe HTTP methods do not require CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt public auth, session control, background heartbeat & warmup endpoints from CSRF
  const exemptPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-email',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/user/active-ping',
    '/api/ai/warmup'
  ];

  if (exemptPaths.includes(req.path)) {
    return next();
  }

  const csrfCookie = req.cookies['XSRF-TOKEN'];
  // Support both standard XSRF and general CSRF custom header names
  const csrfHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    console.warn(`[SECURITY] CSRF Validation Failed. IP: ${req.ip || 'Unknown'}, Path: ${req.path}`);
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed'
    });
  }

  next();
};

/**
 * setCsrfToken: Generates and sets a new XSRF-TOKEN cookie if it is missing.
 */
const setCsrfToken = (req, res, next) => {
  if (!req.cookies['XSRF-TOKEN']) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
  }
  next();
};

module.exports = { csrfProtection, setCsrfToken };
