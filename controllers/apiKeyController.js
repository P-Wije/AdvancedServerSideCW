const db = require('../db');
const { getApiTokenUsage, getApiTokensForUser } = require('../lib/repositories');
const { createOpaqueTokenPair } = require('../lib/security');

function listApiKeys(req, res) {
  return res.json({
    apiKeys: getApiTokensForUser(req.user.id),
  });
}

function createApiKey(req, res) {
  const token = createOpaqueTokenPair();
  const name = String(req.body.name || '').trim();
  const scopes = 'featured:read';

  const result = db.prepare(`
    INSERT INTO api_tokens (created_by_user_id, name, token_prefix, token_hash, scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, name, token.prefix, token.hash, scopes);

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

  return res.json({ message: 'API key revoked successfully.' });
}

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
