const { stringify } = require('csv-stringify/sync');

/**
 * Streams a CSV response for a tabular dataset.
 *
 * @param {import('express').Response} res Express response.
 * @param {string} filename File name suggested to the browser (without extension).
 * @param {Array<Record<string, unknown>>} rows Records to serialise. Column ordering follows the first row's keys.
 * @param {Array<string>=} headers Optional explicit header order.
 */
function sendCsv(res, filename, rows, headers) {
  const columns = headers && headers.length
    ? headers
    : (rows[0] ? Object.keys(rows[0]) : []);
  const csv = stringify(rows, {
    header: true,
    columns,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
}

module.exports = { sendCsv };
