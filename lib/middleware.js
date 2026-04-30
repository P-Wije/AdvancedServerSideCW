const rateLimit = require('express-rate-limit');
const db = require('../db');
const logger = require('./logger');
const { getUserById } = require('./repositories');
const { createOpaqueTokenPair, hashToken, safeCompare } = require('./security');
const { parseScopes } = require('./scopes');
const { setFlash } = require('./flash');

/**
 * Ensures the current browser session has a CSRF token.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @returns {string} Session-bound CSRF token.
 */
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = createOpaqueTokenPair(24).plain;
  }

  return req.session.csrfToken;
}

/**
 * Adds request-scoped values used by downstream handlers and templates.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function attachRequestContext(req, res, next) {
  req.csrfToken = ensureCsrfToken(req);
  res.locals.csrfToken = req.csrfToken;
  res.locals.currentUser = null;
  res.locals.currentPath = req.path;
  // Builds a query string from a filter object, dropping undefined/null/empty
  // values so that `new URLSearchParams` does not serialise them as the literal
  // string "undefined" and break downstream filter parsing.
  res.locals.toQuery = (params = {}, extras = {}) => {
    const merged = { ...params, ...extras };
    const out = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      out.set(key, String(value));
    });
    return out.toString();
  };
  next();
}

/**
 * Surfaces the resolved session user to view templates so navigation can adapt
 * to the visitor's role. Idempotent if no session is present.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 */
function attachCurrentUser(req, res, next) {
  if (req.session?.userId) {
    const user = getUserById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = {
        id: user.id,
        email: user.email,
        role: user.role || 'alumni',
        verified: Boolean(user.email_verified_at),
      };
    }
  }
  next();
}

/**
 * Validates the CSRF token from the `x-csrf-token` header or `_csrf` body field
 * and rejects mismatches with either a 403 JSON payload or a redirect+flash for
 * HTML form submissions.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function validateCsrf(req, res, next) {
  const token = req.get('x-csrf-token') || (req.body && req.body._csrf) || '';
  if (!safeCompare(String(token), req.session.csrfToken || '')) {
    // JSON-flavoured callers (AJAX, Postman, test agents) get 403 JSON; HTML
    // browser submissions are redirected to the referer with a flash message.
    const ct = String(req.get('content-type') || '');
    const accept = String(req.get('accept') || '');
    const looksLikeJson = ct.includes('application/json')
      || accept.includes('application/json')
      || req.path.startsWith('/auth/')
      || req.path.startsWith('/api/')
      || req.path.startsWith('/profile/me')
      || req.path === '/bids'
      || req.path.startsWith('/bids/')
      || req.path === '/events/participation'
      || req.path.endsWith('.json');
    if (looksLikeJson) {
      return res.status(403).json({ message: 'CSRF token missing or invalid.' });
    }
    setFlash(req, 'error', 'Your session has expired. Please reload the page and try again.');
    return res.redirect(req.get('referer') || '/');
  }

  return next();
}

/**
 * Rejects state-changing browser requests that do not include a valid CSRF token.
 *
 * Multipart/form-data requests are deferred to `csrfProtectionAfterMultipart`,
 * which runs in the route pipeline AFTER multer has parsed the body and made
 * `req.body._csrf` available.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Bearer-token endpoints authenticate via API tokens, so CSRF is skipped.
  if (req.path.startsWith('/api/public/') || req.path.startsWith('/api/analytics/') || req.path.startsWith('/api/alumni')) {
    return next();
  }

  // Multipart bodies are not parsed by the global urlencoded/json middleware,
  // so the token field arrives empty here. The route definition is responsible
  // for invoking `csrfProtectionAfterMultipart` once multer has populated body.
  const ct = String(req.get('content-type') || '');
  if (ct.startsWith('multipart/form-data')) {
    return next();
  }

  return validateCsrf(req, res, next);
}

/**
 * Validates CSRF after multer has parsed a multipart body. Apply this middleware
 * directly after the multer instance in any route that accepts file uploads.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 */
function csrfProtectionAfterMultipart(req, res, next) {
  return validateCsrf(req, res, next);
}

/**
 * Ensures the requester has a valid authenticated session and loads the user record.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function requireSession(req, res, next) {
  if (!req.session.userId) {
    if (req.accepts(['html', 'json']) === 'html') {
      setFlash(req, 'info', 'Please sign in to continue.');
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const user = req.user || getUserById(req.session.userId);
  if (!user) {
    req.session.destroy((destroyError) => {
      if (destroyError) {
        logger.error('Failed to destroy invalid session.', destroyError);
      }
    });

    logger.warn('Rejected request for missing user behind active session id.', {
      path: req.originalUrl,
      userId: req.session.userId,
    });
    if (req.accepts(['html', 'json']) === 'html') {
      return res.redirect('/login');
    }
    return res.status(401).json({ message: 'Session expired.' });
  }

  req.user = user;
  return next();
}

/**
 * Prevents access until the email address is verified.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function requireVerifiedUser(req, res, next) {
  if (!req.user?.email_verified_at) {
    if (req.accepts(['html', 'json']) === 'html') {
      setFlash(req, 'error', 'Please verify your email before using this feature.');
      return res.redirect('/login');
    }
    return res.status(403).json({ message: 'Verify your email before using this feature.' });
  }

  return next();
}

/**
 * Returns middleware that enforces the signed-in user belongs to one of the
 * permitted roles. HTML callers are redirected to their canonical landing page
 * with a flash; API callers receive a 403 JSON response.
 *
 * @param {...string} allowedRoles Roles that may proceed.
 * @returns {import('express').RequestHandler}
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || 'alumni';
    if (!allowedRoles.includes(role)) {
      if (req.accepts(['html', 'json']) === 'html') {
        setFlash(req, 'error', 'You do not have permission to view that page.');
        return res.redirect(role === 'university_staff' ? '/dashboard' : '/profile');
      }
      return res.status(403).json({ message: 'Insufficient role for this action.' });
    }
    return next();
  };
}

/**
 * Validates a bearer token and records endpoint usage for audit visibility.
 *
 * After this middleware succeeds, downstream handlers can rely on:
 *   - req.apiToken: the raw token row from `api_tokens`
 *   - req.apiToken.scopeSet: the scopes parsed into a Set for cheap lookup
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
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
    logger.warn('Rejected public API request with invalid or revoked bearer token.', {
      path: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({ message: 'Invalid or revoked API token.' });
  }

  tokenRecord.scopeSet = parseScopes(tokenRecord.scopes);
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

/**
 * Permits either a bearer token holding all required scopes OR a verified
 * session whose role is one of the supplied roles.
 *
 * Used by analytics and directory endpoints so the SSR dashboard can open the
 * raw JSON/CSV downloads in a new tab via the session cookie, while external
 * clients (Postman, the AR app) continue to authenticate with bearer tokens.
 *
 * @param {{scope: string, roles: Array<string>}} options Required scope on
 *   bearer tokens and roles permitted for session callers.
 * @returns {import('express').RequestHandler}
 */
function requireScopeOrRole({ scope, roles }) {
  return (req, res, next) => {
    const hasBearer = String(req.get('authorization') || '').startsWith('Bearer ');
    if (hasBearer) {
      return requireApiToken(req, res, (err) => {
        if (err) return next(err);
        return requireScopes(scope)(req, res, next);
      });
    }
    if (!req.session?.userId || !req.user) {
      if (req.accepts(['html', 'json']) === 'html') {
        return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      }
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!req.user.email_verified_at) {
      return res.status(403).json({ message: 'Verify your email before using this feature.' });
    }
    if (!roles.includes(req.user.role || 'alumni')) {
      return res.status(403).json({ message: 'Insufficient role for this action.' });
    }
    return next();
  };
}

/**
 * Returns middleware that enforces the bearer token holds every required scope.
 * Must run AFTER `requireApiToken` so `req.apiToken.scopeSet` is populated.
 *
 * @param {...string} required Scopes that must all be present on the token.
 * @returns {import('express').RequestHandler}
 */
function requireScopes(...required) {
  return (req, res, next) => {
    const have = req.apiToken?.scopeSet || new Set();
    const missing = required.filter((scope) => !have.has(scope));
    if (missing.length) {
      logger.warn('Rejected request for missing API token scope.', {
        path: req.originalUrl,
        tokenId: req.apiToken?.id,
        missing,
      });
      return res.status(403).json({
        message: 'Token is missing one or more required scopes.',
        missing,
      });
    }
    return next();
  };
}

/**
 * Builds the rate limiter used for registration and password flows.
 *
 * @returns {import('express').RequestHandler} Express middleware instance.
 */
function authRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication requests. Please try again later.' },
  });
}

/**
 * Builds the public API rate limiter used by bearer-token consumers.
 *
 * @returns {import('express').RequestHandler} Express middleware instance.
 */
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
  attachCurrentUser,
  attachRequestContext,
  authRateLimiter,
  csrfProtection,
  csrfProtectionAfterMultipart,
  ensureCsrfToken,
  requireApiToken,
  requireRole,
  requireScopeOrRole,
  requireScopes,
  requireSession,
  requireVerifiedUser,
};
