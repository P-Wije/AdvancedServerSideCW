const analyticsRepo = require('../lib/analyticsRepo');
const { readStandardFilters } = require('../lib/analyticsFilters');
const { sendCsv } = require('../lib/csvFormatter');

/**
 * Returns a flag indicating the caller asked for CSV output via either
 * the `?format=csv` query string or the `Accept: text/csv` header.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function wantsCsv(req) {
  if (String(req.query.format || '').toLowerCase() === 'csv') return true;
  return req.accepts(['json', 'csv']) === 'csv';
}

/**
 * Wraps a handler so it can transparently emit JSON or CSV depending on the request.
 *
 * @param {string} filename CSV filename (without extension).
 * @param {(req: import('express').Request) => {data: object, csvRows: Array<object>, csvHeaders?: Array<string>}} resolve
 * @returns {import('express').RequestHandler}
 */
function dualFormatHandler(filename, resolve) {
  return (req, res) => {
    const { data, csvRows, csvHeaders } = resolve(req);
    if (wantsCsv(req)) {
      return sendCsv(res, filename, csvRows, csvHeaders);
    }
    return res.json(data);
  };
}

const summary = (req, res) => {
  const filters = readStandardFilters(req.query);
  const data = analyticsRepo.getSummary(filters);
  if (wantsCsv(req)) {
    return sendCsv(res, 'analytics-summary', [data]);
  }
  return res.json({ filters, summary: data });
};

const employmentBySector = dualFormatHandler('employment-by-sector', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getEmploymentBySector(filters);
  return { data: { filters, rows }, csvRows: rows };
});

const jobTitles = dualFormatHandler('job-titles', (req) => {
  const filters = readStandardFilters(req.query);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const rows = analyticsRepo.getTopJobTitles(filters, limit);
  return { data: { filters, limit, rows }, csvRows: rows };
});

const topEmployers = dualFormatHandler('top-employers', (req) => {
  const filters = readStandardFilters(req.query);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const rows = analyticsRepo.getTopEmployers(filters, limit);
  return { data: { filters, limit, rows }, csvRows: rows };
});

const geographic = dualFormatHandler('geographic-distribution', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getGeographicDistribution(filters);
  return { data: { filters, rows }, csvRows: rows };
});

const skillsGap = dualFormatHandler('skills-gap', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getSkillsGap(filters);
  return { data: { filters, rows }, csvRows: rows };
});

const professionalDevelopment = dualFormatHandler('professional-development', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getProfessionalDevelopment(filters);
  return { data: { filters, rows }, csvRows: rows };
});

const curriculumCoverage = dualFormatHandler('curriculum-coverage', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getCurriculumCoverage(filters);
  // Flatten scores object for CSV friendliness.
  const csvRows = rows.map((entry) => ({
    programme: entry.programme,
    total: entry.total,
    ...entry.scores,
  }));
  return { data: { filters, rows }, csvRows };
});

const cohortTrend = dualFormatHandler('cohort-trend', (req) => {
  const filters = readStandardFilters(req.query);
  const rows = analyticsRepo.getCohortTrend(filters);
  return { data: { filters, rows }, csvRows: rows };
});

module.exports = {
  cohortTrend,
  curriculumCoverage,
  employmentBySector,
  geographic,
  jobTitles,
  professionalDevelopment,
  skillsGap,
  summary,
  topEmployers,
};
