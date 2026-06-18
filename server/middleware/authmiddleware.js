const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/dbConnector');
const NodeCache = require('node-cache');

const JWT_SECRET = process.env.JWT_SECRET;
const userCache = new NodeCache({ stdTTL: 15 });

function getTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  return req.cookies?.access_token || bearerToken || null;
}

/**
 * verifyToken: Main protection for user routes
 * - Validates JWT
 * - Fetches user from DB for REAL status checks (isActive, role)
 * - Blocks suspended accounts even if token is old
 */
const verifyToken = async (req, res, next) => {
  const isAiRoute = req.path.startsWith('/ai') || req.path.startsWith('/api/ai') || req.originalUrl.includes('/ai/');
  try {
    if (!JWT_SECRET) {
      console.error('SECURITY CRITICAL: JWT_SECRET is not defined in environment variables.');
      if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed: JWT_SECRET missing`);
      return res.status(500).json({
        success: false,
        message: 'Internal server configuration error'
      });
    }

    const token = getTokenFromRequest(req);

    if (!token) {
      if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed: Token missing`);
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // 1) Decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded?.id || decoded.type !== 'access') {
      if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed: Invalid token payload or type`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload or type'
      });
    }

    // 2) Fetch user from DB (source of truth) with short-lived memory cache
    const cacheKey = `user-${decoded.id}`;
    let user = userCache.get(cacheKey);

    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          role: true,
          email: true,
          authProvider: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true
        }
      });
      if (user) {
        userCache.set(cacheKey, user);
      }
    }

    if (!user) {
      if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed: User not found in DB`);
      return res.status(401).json({
        success: false,
        message: 'User not found for this token'
      });
    }

    // 3) Block suspended accounts always
    if (user.isActive === false) {
      if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed: User suspended`);
      return res.status(403).json({
        success: false,
        message: 'Account suspended. Please reactivate via email.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // 4) Attach safe + full auth identity
    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      authProvider: user.authProvider,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified
    };

    if (isAiRoute) {
      const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
      console.log(`[AUTH DIAGNOSTIC] Path: ${req.path}, OriginalUrl: ${req.originalUrl}, CookieKeys: ${JSON.stringify(cookieNames)}, UserID: ${user.id}, Status: Pass`);
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    if (isAiRoute) console.log(`[AUTH DIAGNOSTIC] Path: ${req.path} failed with catch error: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
};

/**
 * isAdmin: Restricts routes to admin users only
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * optionalAuth: Identifies user if token exists, but doesn't block if it doesn't
 * - DOES NOT query DB (fast)
 * - Use only for optional features like showing "logged in" UI on landing pages
 */
const optionalAuth = (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (token && JWT_SECRET) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  optionalAuth
};
