const db = require('../db');
const logger = require('../lib/logger');
const { getApiTokenUsage, getApiTokensForUser } = require('../lib/repositories');
const { CLIENT_PRESETS, SCOPES, serializeScopes, validateScopes } = require('../lib/scopes');
const { createOpaqueTokenPair } = require('../lib/security');

/**
 * Lists API keys owned by the signed-in user.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function listApiKeys(req, res) {
  return res.json({
    apiKeys: getApiTokensForUser(req.user.id),
  });
}

/**
 * Resolves the final scope list for a new API token.
 *
 * Priority: explicit `scopes` body field, then `clientPreset` mapping, then a
 * default of `read:alumni_of_day` so legacy callers keep working.
 *
 * @param {object} body Request body payload.
 * @returns {Array<string>} Resolved scope list.
 */
function resolveScopes(body) {
  if (Array.isArray(body.scopes) && body.scopes.length) {
    return body.scopes;
  }
  if (typeof body.scopes === 'string' && body.scopes.trim()) {
    return body.scopes.split(/[\s,]+/).filter(Boolean);
  }
  if (body.clientPreset && CLIENT_PRESETS[body.clientPreset]?.length) {
    return [...CLIENT_PRESETS[body.clientPreset]];
  }
  return [SCOPES.READ_ALUMNI_OF_DAY];
}

/**
 * Creates a new bearer token for the signed-in user and returns the plain token once.
 *
 * Accepts either an explicit `scopes` array or a `clientPreset` (e.g. analytics_dashboard,
 * ar_app, custom). The granted scope set is stored as a space-separated string on
 * `api_tokens.scopes` and enforced by `requireScopes(...)` middleware on each protected
 * route. The plain token value appears ONCE in the response payload because only the
 * SHA-256 hash is persisted.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function createApiKey(req, res) {
  const token = createOpaqueTokenPair();
  const name = String(req.body.name || '').trim();
  const requestedScopes = resolveScopes(req.body);
  const validation = validateScopes(requestedScopes);
  if (!validation.valid) {
    return res.status(422).json({
      message: 'One or more requested scopes are not recognised.',
      unknown: validation.unknown,
    });
  }

  const scopes = serializeScopes(requestedScopes);
  const result = db.prepare(`
    INSERT INTO api_tokens (created_by_user_id, name, token_prefix, token_hash, scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, name, token.prefix, token.hash, scopes);

  logger.info('Created developer API key.', {
    userId: req.user.id,
    apiKeyId: result.lastInsertRowid,
    name,
    scopes,
  });

  return res.status(201).json({
    message: 'API key created successfully. Store it now because it will not be shown again.',
    apiKey: {
      id: result.lastInsertRowid,
      name,
      scopes,
      token: token.plain,
      tokenPrefix: token.prefix,
    },
  });
}

/**
 * Revokes a previously created API key.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function revokeApiKey(req, res) {
  const id = Number(req.params.id);
  const result = db.prepare(`
    UPDATE api_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND created_by_user_id = ? AND revoked_at IS NULL
  `).run(id, req.user.id);

  if (!result.changes) {
    return res.status(404).json({ message: 'API key not found or already revoked.' });
  }

  logger.info('Revoked developer API key.', {
    userId: req.user.id,
    apiKeyId: id,
  });

  return res.json({ message: 'API key revoked successfully.' });
}

/**
 * Returns detailed usage information for one API key owned by the signed-in user.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function getApiKeyUsage(req, res) {
  const id = Number(req.params.id);
  const token = db.prepare('SELECT * FROM api_tokens WHERE id = ? AND created_by_user_id = ?').get(id, req.user.id);
  if (!token) {
    return res.status(404).json({ message: 'API key not found.' });
  }

  return res.json({
    apiKey: {
      id: token.id,
      name: token.name,
      tokenPrefix: token.token_prefix,
      scopes: token.scopes,
      createdAt: token.created_at,
      lastUsedAt: token.last_used_at,
      revokedAt: token.revoked_at,
    },
    usage: getApiTokenUsage(token.id, 100),
  });
}

module.exports = {
  createApiKey,
  getApiKeyUsage,
  listApiKeys,
  revokeApiKey,
};
