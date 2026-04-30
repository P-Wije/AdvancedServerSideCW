const PDFDocument = require('pdfkit');
const analyticsRepo = require('./analyticsRepo');

/**
 * Picks a one-paragraph qualitative insight string for each metric so the PDF
 * report tells a story rather than just dumping numbers.
 *
 * @param {string} metric Metric key.
 * @param {Array<object>} rows Sorted rows (high to low).
 * @returns {string} Insight paragraph.
 */
function buildInsight(metric, rows) {
  if (!rows.length) return 'No data available for the selected filters.';
  switch (metric) {
    case 'employmentBySector': {
      const total = rows.reduce((sum, r) => sum + r.value, 0);
      const top = rows[0];
      const share = Math.round((top.value / Math.max(total, 1)) * 100);
      let level = 'healthy distribution across sectors';
      if (share >= 40) level = 'critical concentration in a single sector';
      else if (share >= 20) level = 'a significant lean toward one sector';
      return `${top.label} accounts for ${share}% of currently employed alumni, indicating ${level}.`;
    }
    case 'topEmployers': {
      const total = rows.reduce((sum, r) => sum + r.value, 0);
      const top = rows[0];
      const share = Math.round((top.value / Math.max(total, 1)) * 100);
      return `${top.label} employs the largest share of alumni in this filtered cohort (${share}%${share >= 15 ? ', concentration risk to monitor' : ''}).`;
    }
    case 'geographic': {
      const total = rows.reduce((sum, r) => sum + r.value, 0);
      const top = rows[0];
      const share = Math.round((top.value / Math.max(total, 1)) * 100);
      return `${share}% of alumni in this cohort are based in ${top.label}.`;
    }
    case 'jobTitles':
      return `The most common current role is "${rows[0].label}" (${rows[0].value} alumni), with ${rows.length} distinct titles in the top set.`;
    case 'cohortTrend': {
      const earliest = rows[0];
      const latest = rows[rows.length - 1];
      return `Cohort sizes range from ${earliest.value} (${earliest.year}) to ${latest.value} (${latest.year}).`;
    }
    case 'professionalDevelopment':
      return `${rows.length} achievement entries recorded across the cohort's post-graduation development.`;
    case 'skillsGap':
      return `Programme/sector cross-tab includes ${rows.length} programme-sector combinations.`;
    case 'curriculumCoverage':
      return `Coverage scored across ${rows.length} programmes; values are share (0-1) of graduates with at least one matching achievement.`;
    default:
      return '';
  }
}

/**
 * Streams a comprehensive analytics report to the supplied response object.
 *
 * The report includes a cover page, table of contents, and one page per
 * analytical metric with a short qualitative insight and a tabular dump of
 * the underlying numbers. Charts are not embedded server-side (which would
 * require a headless browser); the dashboard offers a per-chart PNG download
 * for callers who want bitmap exports.
 *
 * @param {import('express').Response} res Express response to stream into.
 * @param {object} filters Output of `readStandardFilters` for context labels.
 */
function streamAnalyticsReport(res, filters) {
  const generatedAt = new Date().toISOString();
  const datasets = [
    { key: 'summary', title: 'Headline Metrics', rows: [analyticsRepo.getSummary(filters)] },
    { key: 'employmentBySector', title: 'Employment by Industry Sector', rows: analyticsRepo.getEmploymentBySector(filters) },
    { key: 'jobTitles', title: 'Most Common Current Job Titles', rows: analyticsRepo.getTopJobTitles(filters, 10) },
    { key: 'topEmployers', title: 'Top Employers', rows: analyticsRepo.getTopEmployers(filters, 10) },
    { key: 'geographic', title: 'Geographic Distribution', rows: analyticsRepo.getGeographicDistribution(filters) },
    { key: 'skillsGap', title: 'Programme × Sector Skills Gap', rows: analyticsRepo.getSkillsGap(filters) },
    { key: 'professionalDevelopment', title: 'Professional Development Trends', rows: analyticsRepo.getProfessionalDevelopment(filters) },
    { key: 'curriculumCoverage', title: 'Curriculum Coverage by Programme', rows: analyticsRepo.getCurriculumCoverage(filters) },
    { key: 'cohortTrend', title: 'Cohort Trend', rows: analyticsRepo.getCohortTrend(filters) },
  ];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="alumni-analytics-${generatedAt.slice(0, 10)}.pdf"`);

  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(res);

  // Cover page.
  doc.fontSize(28).font('Helvetica-Bold').text('University of Eastminster', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(20).font('Helvetica').text('Alumni Analytics Report', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).text(`Generated: ${generatedAt}`, { align: 'center' });
  doc.moveDown(0.5);
  const filterParts = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`);
  doc.text(`Filters: ${filterParts.length ? filterParts.join(', ') : 'none'}`, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(11).fillColor('#444').text('This report summarises post-graduation outcomes captured by the Alumni Influencers platform. Each section pairs a quantitative table with a one-paragraph qualitative insight to support curriculum and strategic-planning decisions.', { align: 'center' });
  doc.fillColor('black');

  // Table of contents.
  doc.addPage();
  doc.fontSize(20).font('Helvetica-Bold').text('Contents', { underline: true });
  doc.moveDown();
  doc.fontSize(12).font('Helvetica');
  datasets.forEach((entry, index) => {
    doc.text(`${index + 1}. ${entry.title}`);
  });

  // One page per dataset.
  datasets.forEach((entry) => {
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').text(entry.title);
    doc.moveDown(0.6);
    doc.fontSize(11).font('Helvetica-Oblique').fillColor('#555').text(buildInsight(entry.key, entry.rows));
    doc.fillColor('black').font('Helvetica').moveDown(1);

    if (!entry.rows.length) {
      doc.text('No data for this metric within the active filters.');
      return;
    }

    // Render columns dynamically from the first row keys.
    const columns = Object.keys(entry.rows[0]);
    const colWidth = (doc.page.width - doc.options.margin * 2) / columns.length;
    let y = doc.y;
    doc.font('Helvetica-Bold');
    columns.forEach((col, idx) => {
      doc.text(col, doc.options.margin + idx * colWidth, y, { width: colWidth, ellipsis: true });
    });
    doc.font('Helvetica');
    doc.moveDown(0.5);

    entry.rows.slice(0, 30).forEach((row) => {
      y = doc.y;
      columns.forEach((col, idx) => {
        const value = row[col];
        const text = value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
        doc.text(text, doc.options.margin + idx * colWidth, y, { width: colWidth, ellipsis: true });
      });
      doc.moveDown(0.5);
    });

    if (entry.rows.length > 30) {
      doc.moveDown(0.5).font('Helvetica-Oblique').text(`... ${entry.rows.length - 30} additional rows omitted.`);
    }
  });

  doc.end();
}

module.exports = { streamAnalyticsReport };
