const analyticsRepo = require('../lib/analyticsRepo');
const { readStandardFilters } = require('../lib/analyticsFilters');
const { sendCsv } = require('../lib/csvFormatter');

/**
 * Returns the filtered alumni directory.
 *
 * Supports both JSON (default) and CSV output via `?format=csv`.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 */
function listAlumni(req, res) {
  const filters = readStandardFilters(req.query);
  const result = analyticsRepo.getAlumniDirectory(filters, {
    page: req.query.page,
    pageSize: req.query.pageSize,
  });

  if (String(req.query.format || '').toLowerCase() === 'csv') {
    return sendCsv(res, 'alumni-directory', result.rows);
  }

  return res.json({
    filters,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    total: result.total,
    rows: result.rows,
  });
}

module.exports = { listAlumni };
