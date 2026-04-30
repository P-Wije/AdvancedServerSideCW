const db = require('../../db');
const logger = require('../../lib/logger');
const { setFlash } = require('../../lib/flash');
const { getApiTokenUsage, getApiTokensForUser } = require('../../lib/repositories');
const { ALL_SCOPES, CLIENT_PRESETS, SCOPES, serializeScopes, validateScopes } = require('../../lib/scopes');
const { createOpaqueTokenPair } = require('../../lib/security');

const showApiKeys = (req, res) => {
  const apiKeys = getApiTokensForUser(req.user.id);
  // Show the freshly issued plain token once, then clear it from the session.
  const justCreated = req.session.justCreatedApiKey || null;
  if (req.session.justCreatedApiKey) {
    delete req.session.justCreatedApiKey;
  }
  res.render('api-keys', {
    title: 'Developer API keys',
    apiKeys,
    justCreated,
    scopes: ALL_SCOPES,
    clientPresets: Object.keys(CLIENT_PRESETS),
    presetMap: CLIENT_PRESETS,
  });
};

const submitCreateApiKey = (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 3 || name.length > 80) {
    setFlash(req, 'error', 'API key name must be between 3 and 80 characters.');
    return res.redirect('/developer/api-keys');
  }

  const preset = String(req.body.clientPreset || '').trim();
  let requestedScopes = [];
  if (Array.isArray(req.body.scopes)) {
    requestedScopes = req.body.scopes;
  } else if (typeof req.body.scopes === 'string' && req.body.scopes.trim()) {
    requestedScopes = req.body.scopes.split(/[\s,]+/).filter(Boolean);
  } else if (preset && CLIENT_PRESETS[preset]?.length) {
    requestedScopes = [...CLIENT_PRESETS[preset]];
  } else {
    requestedScopes = [SCOPES.READ_ALUMNI_OF_DAY];
  }

  const validation = validateScopes(requestedScopes);
  if (!validation.valid) {
    setFlash(req, 'error', `Unknown scopes: ${validation.unknown.join(', ')}`);
    return res.redirect('/developer/api-keys');
  }

  const scopes = serializeScopes(requestedScopes);
  const token = createOpaqueTokenPair();
  const result = db.prepare(`
    INSERT INTO api_tokens (created_by_user_id, name, token_prefix, token_hash, scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, name, token.prefix, token.hash, scopes);

  logger.info('Created API key via SSR.', { userId: req.user.id, scopes });
  // The plain token is shown once on the next render so the user can copy it.
  req.session.justCreatedApiKey = {
    id: result.lastInsertRowid,
    name,
    scopes,
    plainToken: token.plain,
    tokenPrefix: token.prefix,
  };

  setFlash(req, 'success', 'API key created. Copy it now, it will not be shown again.');
  return res.redirect('/developer/api-keys');
};

const submitRevokeApiKey = (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`
    UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND created_by_user_id = ? AND revoked_at IS NULL
  `).run(id, req.user.id);
  if (!result.changes) {
    setFlash(req, 'error', 'API key not found or already revoked.');
  } else {
    logger.info('Revoked API key via SSR.', { userId: req.user.id, apiKeyId: id });
    setFlash(req, 'success', 'API key revoked.');
  }
  return res.redirect('/developer/api-keys');
};

const showApiKeyUsage = (req, res) => {
  const id = Number(req.params.id);
  const token = db.prepare('SELECT * FROM api_tokens WHERE id = ? AND created_by_user_id = ?').get(id, req.user.id);
  if (!token) {
    setFlash(req, 'error', 'API key not found.');
    return res.redirect('/developer/api-keys');
  }
  const usage = getApiTokenUsage(token.id, 100);
  return res.render('api-key-usage', {
    title: `${token.name} usage`,
    apiKey: {
      id: token.id,
      name: token.name,
      tokenPrefix: token.token_prefix,
      scopes: token.scopes,
      createdAt: token.created_at,
      lastUsedAt: token.last_used_at,
      revokedAt: token.revoked_at,
    },
    usage,
  });
};

module.exports = {
  showApiKeys,
  showApiKeyUsage,
  submitCreateApiKey,
  submitRevokeApiKey,
};
