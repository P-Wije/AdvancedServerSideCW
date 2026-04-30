/**
 * Builds parameterised SQL fragments for the dashboard's filter form.
 *
 * The same filter shape is shared between every analytics endpoint and the
 * alumni directory: `programme`, `graduationFrom`, `graduationTo`, `sector`,
 * `country`. Each clause references the appropriate column with a table alias
 * the caller passes in (`p.` for profiles, `eh.` for employment_history).
 */

/**
 * Reads a string filter value from a query bag, trimming whitespace and
 * collapsing empty strings to undefined so the WHERE clause stays compact.
 *
 * @param {unknown} value Raw query value.
 * @returns {string|undefined}
 */
function readFilter(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Parses the standard filter set out of `req.query` into a typed object.
 *
 * @param {Record<string, unknown>} query Express query parameters.
 * @returns {{programme?: string, graduationFrom?: string, graduationTo?: string, sector?: string, country?: string}}
 */
function readStandardFilters(query) {
  return {
    programme: readFilter(query.programme),
    graduationFrom: readFilter(query.graduationFrom),
    graduationTo: readFilter(query.graduationTo),
    sector: readFilter(query.sector),
    country: readFilter(query.country),
  };
}

/**
 * Builds an SQL where-clause fragment + parameter list for the standard filters.
 *
 * @param {object} filters Output of `readStandardFilters`.
 * @param {{profileAlias?: string, employmentAlias?: string}} aliases Table aliases used in the query.
 * @returns {{clause: string, params: Array<unknown>}} SQL fragment ready for concatenation.
 */
function buildFilterClause(filters, aliases = {}) {
  const profileAlias = aliases.profileAlias ?? 'p';
  const employmentAlias = aliases.employmentAlias ?? 'eh';
  const clauses = [];
  const params = [];

  if (filters.programme) {
    clauses.push(`${profileAlias}.programme = ?`);
    params.push(filters.programme);
  }
  if (filters.graduationFrom) {
    clauses.push(`${profileAlias}.graduation_date >= ?`);
    params.push(filters.graduationFrom);
  }
  if (filters.graduationTo) {
    clauses.push(`${profileAlias}.graduation_date <= ?`);
    params.push(filters.graduationTo);
  }
  if (filters.sector) {
    clauses.push(`${employmentAlias}.industry_sector = ?`);
    params.push(filters.sector);
  }
  if (filters.country) {
    clauses.push(`${employmentAlias}.location_country = ?`);
    params.push(filters.country);
  }

  return {
    clause: clauses.length ? `AND ${clauses.join(' AND ')}` : '',
    params,
  };
}

module.exports = {
  buildFilterClause,
  readStandardFilters,
};
