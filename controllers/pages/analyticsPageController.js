const analyticsRepo = require('../../lib/analyticsRepo');
const { readStandardFilters } = require('../../lib/analyticsFilters');
const { streamAnalyticsReport } = require('../../lib/reportGenerator');

/**
 * Per-chart-page definitions that DRY up the render boilerplate.
 *
 * `dataLoader` returns the rows embedded into the EJS template inside a
 * `<script type="application/json">` block, where the client-side Chart.js
 * runner picks them up.
 */
const CHART_DEFINITIONS = {
  'employment-sector': {
    title: 'Employment by Industry Sector',
    description: 'Distribution of currently employed alumni across industry sectors. Top sectors flagged for over-concentration.',
    chartType: 'doughnut',
    insightLevel: 'critical-when-top-share-over-40',
    api: '/api/analytics/employment-by-sector',
    dataLoader: (filters) => analyticsRepo.getEmploymentBySector(filters),
  },
  'job-titles': {
    title: 'Most Common Job Titles',
    description: 'Top current job titles among alumni in the filtered cohort.',
    chartType: 'bar',
    insightLevel: 'rank-coloured',
    api: '/api/analytics/job-titles',
    dataLoader: (filters) => analyticsRepo.getTopJobTitles(filters, 10),
  },
  'top-employers': {
    title: 'Top Employers',
    description: 'Top employers across the filtered cohort. Concentration over 15% flagged.',
    chartType: 'bar',
    insightLevel: 'critical-when-top-share-over-15',
    api: '/api/analytics/top-employers',
    dataLoader: (filters) => analyticsRepo.getTopEmployers(filters, 10),
  },
  geographic: {
    title: 'Geographic Distribution',
    description: 'Where alumni are based today, by current employment country.',
    chartType: 'pie',
    insightLevel: 'retention',
    api: '/api/analytics/geographic',
    dataLoader: (filters) => analyticsRepo.getGeographicDistribution(filters),
  },
  'skills-gap': {
    title: 'Curriculum Skills Gap',
    description: 'Cross-tab of programme of study versus current industry sector. Highlights programmes whose graduates land predominantly in one sector.',
    chartType: 'stacked-bar',
    insightLevel: 'critical-when-single-sector-over-60',
    api: '/api/analytics/skills-gap',
    dataLoader: (filters) => analyticsRepo.getSkillsGap(filters),
  },
  'professional-development': {
    title: 'Professional Development Trends',
    description: 'Volume of certifications, licences, and short courses completed each year.',
    chartType: 'line',
    insightLevel: 'slope-trend',
    api: '/api/analytics/professional-development',
    dataLoader: (filters) => analyticsRepo.getProfessionalDevelopment(filters),
  },
  'curriculum-coverage': {
    title: 'Curriculum Coverage by Programme',
    description: 'Per-programme share of graduates with achievements in cloud, security, data, design, management and agile competencies.',
    chartType: 'radar',
    insightLevel: 'critical-when-axis-under-0.2',
    api: '/api/analytics/curriculum-coverage',
    dataLoader: (filters) => analyticsRepo.getCurriculumCoverage(filters),
  },
  'cohort-trend': {
    title: 'Cohort Trend by Graduation Year',
    description: 'Number of alumni in the platform grouped by graduation year.',
    chartType: 'line',
    insightLevel: 'year-on-year-delta',
    api: '/api/analytics/cohort-trend',
    dataLoader: (filters) => analyticsRepo.getCohortTrend(filters),
  },
};

const showHub = (req, res) => {
  const filters = readStandardFilters(req.query);
  const filterOptions = analyticsRepo.getFilterOptions();
  const summary = analyticsRepo.getSummary(filters);

  // Pre-load thumbnail payloads so each hub card renders without a follow-up request.
  const tiles = Object.entries(CHART_DEFINITIONS).map(([slug, def]) => ({
    slug,
    title: def.title,
    chartType: def.chartType,
    description: def.description,
    data: def.dataLoader(filters),
  }));

  res.render('analytics/index', {
    title: 'Analytics overview',
    filters,
    filterOptions,
    summary,
    tiles,
  });
};

const showChartPage = (req, res, slug) => {
  const def = CHART_DEFINITIONS[slug];
  if (!def) {
    return res.status(404).render('not-found', { title: 'Not found' });
  }
  const filters = readStandardFilters(req.query);
  const data = def.dataLoader(filters);
  const filterOptions = analyticsRepo.getFilterOptions();
  return res.render(`analytics/${slug}`, {
    title: def.title,
    description: def.description,
    chartType: def.chartType,
    insightLevel: def.insightLevel,
    api: def.api,
    slug,
    filters,
    filterOptions,
    data,
  });
};

const renderEmploymentSector = (req, res) => showChartPage(req, res, 'employment-sector');
const renderJobTitles = (req, res) => showChartPage(req, res, 'job-titles');
const renderTopEmployers = (req, res) => showChartPage(req, res, 'top-employers');
const renderGeographic = (req, res) => showChartPage(req, res, 'geographic');
const renderSkillsGap = (req, res) => showChartPage(req, res, 'skills-gap');
const renderProfessionalDevelopment = (req, res) => showChartPage(req, res, 'professional-development');
const renderCurriculumCoverage = (req, res) => showChartPage(req, res, 'curriculum-coverage');
const renderCohortTrend = (req, res) => showChartPage(req, res, 'cohort-trend');

const downloadReport = (req, res) => {
  const filters = readStandardFilters(req.query);
  streamAnalyticsReport(res, filters);
};

module.exports = {
  CHART_DEFINITIONS,
  downloadReport,
  renderCohortTrend,
  renderCurriculumCoverage,
  renderEmploymentSector,
  renderGeographic,
  renderJobTitles,
  renderProfessionalDevelopment,
  renderSkillsGap,
  renderTopEmployers,
  showHub,
};
