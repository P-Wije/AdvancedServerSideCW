const rateLimit = require('express-rate-limit');
const db = require('../db');
const { getUserById } = require('./repositories');
const { createOpaqueTokenPair, hashToken, safeCompare } = require('./security');

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = createOpaqueTokenPair(24).plain;
  }

  return req.session.csrfToken;
}

function attachRequestContext(req, res, next) {
  req.csrfToken = ensureCsrfToken(req);
  res.locals.csrfToken = req.csrfToken;
  next();
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (req.path.startsWith('/api/public/')) {
    return next();
  }

  const token = req.get('x-csrf-token');
  if (!safeCompare(token || '', req.session.csrfToken || '')) {
    return res.status(403).json({ message: 'CSRF token missing or invalid.' });
  }

  return next();
}

function requireSession(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Session expired.' });
  }

  req.user = user;
  return next();
}

function requireVerifiedUser(req, res, next) {
  if (!req.user?.email_verified_at) {
    return res.status(403).json({ message: 'Verify your email before using this feature.' });
  }

  return next();
}

function requireApiToken(req, res, next) {
  const rawHeader = req.get('authorization') || '';
  const token = rawHeader.startsWith('Bearer ') ? rawHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ message: 'Bearer token required.' });
  }

  const tokenHash = hashToken(token);
  const tokenRecord = db.prepare(`
    SELECT *
    FROM api_tokens
    WHERE token_hash = ?
      AND revoked_at IS NULL
  `).get(tokenHash);

  if (!tokenRecord) {
    return res.status(401).json({ message: 'Invalid or revoked API token.' });
  }

  req.apiToken = tokenRecord;
  res.on('finish', () => {
    db.prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(tokenRecord.id);
    db.prepare(`
      INSERT INTO api_token_usage (api_token_id, endpoint, http_method, ip_address, user_agent, response_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      tokenRecord.id,
      req.originalUrl,
      req.method,
      req.ip,
      req.get('user-agent') || null,
      res.statusCode,
    );
  });

  return next();
}

function authRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication requests. Please try again later.' },
  });
}

function apiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many API requests. Please slow down.' },
  });
}

module.exports = {
  apiRateLimiter,
  attachRequestContext,
  authRateLimiter,
  csrfProtection,
  ensureCsrfToken,
  requireApiToken,
  requireSession,
  requireVerifiedUser,
};
