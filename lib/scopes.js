/**
 * Canonical permission vocabulary for bearer-token clients.
 *
 * Scopes are stored on the `api_tokens.scopes` column as a space-separated
 * string. This keeps the schema flat while still permitting multi-scope keys.
 */
const SCOPES = Object.freeze({
  READ_ALUMNI: 'read:alumni',
  READ_ANALYTICS: 'read:analytics',
  READ_ALUMNI_OF_DAY: 'read:alumni_of_day',
  READ_DONATIONS: 'read:donations',
});

const ALL_SCOPES = Object.freeze(Object.values(SCOPES));

/**
 * Convenience presets that map a client class to a default scope set.
 * `custom` keeps the door open for ad-hoc keys with manually selected scopes.
 */
const CLIENT_PRESETS = Object.freeze({
  analytics_dashboard: [SCOPES.READ_ALUMNI, SCOPES.READ_ANALYTICS],
  ar_app: [SCOPES.READ_ALUMNI_OF_DAY],
  custom: [],
});

/**
 * Parses a scopes string from the database into a Set for O(1) lookup.
 *
 * @param {string|null|undefined} raw Stored scopes column value.
 * @returns {Set<string>} Set of scope strings (empty when none granted).
 */
function parseScopes(raw) {
  if (!raw) return new Set();
  return new Set(String(raw).split(/\s+/).filter(Boolean));
}

/**
 * Validates a list of scope strings against the canonical vocabulary.
 *
 * @param {Array<string>} scopes Candidate scope list.
 * @returns {{valid: boolean, unknown: Array<string>}} Validation report.
 */
function validateScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return { valid: false, unknown: [] };
  }

  const unknown = scopes.filter((scope) => !ALL_SCOPES.includes(scope));
  return { valid: unknown.length === 0, unknown };
}

/**
 * Serialises a scope array to the storage format. Deduplicates and sorts so
 * tokens with the same scope set produce identical column values.
 *
 * @param {Array<string>} scopes Scope list to persist.
 * @returns {string} Space-separated scope string.
 */
function serializeScopes(scopes) {
  return Array.from(new Set(scopes)).sort().join(' ');
}

module.exports = {
  ALL_SCOPES,
  CLIENT_PRESETS,
  SCOPES,
  parseScopes,
  serializeScopes,
  validateScopes,
};
