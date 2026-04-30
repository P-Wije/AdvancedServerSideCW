const db = require('../db');
const { buildFilterClause } = require('./analyticsFilters');

/**
 * Keyword buckets used to score curriculum coverage. Each profile's achievements
 * are matched against these keywords with case-insensitive LIKE, so the chart
 * can highlight programmes whose graduates rarely earn certifications in a
 * particular competency area.
 */
const COVERAGE_KEYWORDS = Object.freeze({
  cloud: ['aws', 'azure', 'gcp', 'cloud', 'kubernetes', 'docker'],
  security: ['security', 'cissp', 'comptia', 'ethical hacking', 'penetration'],
  data: ['data', 'sql', 'tableau', 'analytics', 'machine learning', 'python'],
  design: ['design', 'ux', 'ui', 'figma', 'adobe'],
  management: ['pmp', 'prince2', 'management', 'leadership', 'mba'],
  agile: ['agile', 'scrum', 'kanban', 'safe'],
});

/**
 * High-level KPIs displayed on the analytics hub page.
 *
 * @param {object} filters Output of `readStandardFilters`.
 */
function getSummary(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  const baseFromClause = `
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE 1=1 ${filterClause.clause}
  `;

  const totalAlumni = db.prepare(`SELECT COUNT(DISTINCT p.user_id) AS total ${baseFromClause}`).get(...filterClause.params)?.total || 0;
  const programmesCount = db.prepare(`SELECT COUNT(DISTINCT p.programme) AS total ${baseFromClause} AND p.programme IS NOT NULL`).get(...filterClause.params)?.total || 0;
  const employedNow = db.prepare(`SELECT COUNT(DISTINCT p.user_id) AS total ${baseFromClause} AND eh.id IS NOT NULL`).get(...filterClause.params)?.total || 0;
  const sectorsCount = db.prepare(`SELECT COUNT(DISTINCT eh.industry_sector) AS total ${baseFromClause} AND eh.industry_sector IS NOT NULL`).get(...filterClause.params)?.total || 0;

  return { totalAlumni, programmesCount, employedNow, sectorsCount };
}

/**
 * Distribution of currently-employed alumni by industry sector.
 */
function getEmploymentBySector(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT eh.industry_sector AS label, COUNT(DISTINCT eh.user_id) AS value
    FROM employment_history eh
    INNER JOIN profiles p ON p.user_id = eh.user_id
    WHERE eh.is_current = 1
      AND eh.industry_sector IS NOT NULL
      ${filterClause.clause}
    GROUP BY eh.industry_sector
    ORDER BY value DESC
  `).all(...filterClause.params);
}

/**
 * Top N current job titles across the filtered cohort.
 *
 * @param {object} filters Output of `readStandardFilters`.
 * @param {number} limit Maximum rows.
 */
function getTopJobTitles(filters, limit = 10) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT eh.job_title AS label, COUNT(*) AS value
    FROM employment_history eh
    INNER JOIN profiles p ON p.user_id = eh.user_id
    WHERE eh.is_current = 1
      ${filterClause.clause}
    GROUP BY eh.job_title
    ORDER BY value DESC
    LIMIT ?
  `).all(...filterClause.params, limit);
}

/**
 * Top N current employers across the filtered cohort.
 */
function getTopEmployers(filters, limit = 10) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT eh.employer AS label, COUNT(DISTINCT eh.user_id) AS value
    FROM employment_history eh
    INNER JOIN profiles p ON p.user_id = eh.user_id
    WHERE eh.is_current = 1
      ${filterClause.clause}
    GROUP BY eh.employer
    ORDER BY value DESC
    LIMIT ?
  `).all(...filterClause.params, limit);
}

/**
 * Geographic distribution of alumni by country of current employment.
 */
function getGeographicDistribution(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT eh.location_country AS label, COUNT(DISTINCT eh.user_id) AS value
    FROM employment_history eh
    INNER JOIN profiles p ON p.user_id = eh.user_id
    WHERE eh.is_current = 1
      AND eh.location_country IS NOT NULL
      ${filterClause.clause}
    GROUP BY eh.location_country
    ORDER BY value DESC
  `).all(...filterClause.params);
}

/**
 * Cross-tab of programme x current industry sector for the stacked-bar chart.
 *
 * Returns an array of `{programme, sector, value}` rows; the client reshapes
 * this into a stacked dataset so each programme stack represents the spread of
 * sectors its graduates land in.
 */
function getSkillsGap(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT p.programme AS programme,
           COALESCE(eh.industry_sector, 'Unspecified') AS sector,
           COUNT(DISTINCT p.user_id) AS value
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE p.programme IS NOT NULL
      ${filterClause.clause}
    GROUP BY p.programme, sector
    ORDER BY p.programme, value DESC
  `).all(...filterClause.params);
}

/**
 * Number of non-degree achievements completed per year, grouped by type.
 *
 * Drives the multi-series line chart that shows whether certification take-up
 * is rising, flat, or declining year over year.
 */
function getProfessionalDevelopment(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT substr(a.completion_date, 1, 4) AS year,
           a.achievement_type AS type,
           COUNT(*) AS value
    FROM achievements a
    INNER JOIN profiles p ON p.user_id = a.user_id
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE a.achievement_type != 'degree'
      AND a.completion_date IS NOT NULL
      ${filterClause.clause}
    GROUP BY year, type
    ORDER BY year ASC
  `).all(...filterClause.params);
}

/**
 * Returns a per-programme curriculum coverage matrix.
 *
 * For each programme, computes the share of graduates with at least one
 * achievement title matching each keyword bucket (cloud, security, data,
 * design, management, agile). Result powers the radar chart on the
 * curriculum-coverage page. SQL handles the matching with one LIKE-OR group
 * per bucket so the controller stays simple.
 */
function getCurriculumCoverage(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  const programmes = db.prepare(`
    SELECT DISTINCT p.programme AS programme
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE p.programme IS NOT NULL
      ${filterClause.clause}
    ORDER BY programme
  `).all(...filterClause.params);

  return programmes.map(({ programme }) => {
    const totalRow = db.prepare(`
      SELECT COUNT(DISTINCT p.user_id) AS total
      FROM profiles p
      LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
      WHERE p.programme = ? ${filterClause.clause}
    `).get(programme, ...filterClause.params);
    const total = totalRow?.total || 0;

    const scores = {};
    for (const [bucket, keywords] of Object.entries(COVERAGE_KEYWORDS)) {
      const likeFragments = keywords.map(() => 'LOWER(a.title) LIKE ?').join(' OR ');
      const likeParams = keywords.map((kw) => `%${kw.toLowerCase()}%`);
      const row = db.prepare(`
        SELECT COUNT(DISTINCT p.user_id) AS matched
        FROM profiles p
        LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
        INNER JOIN achievements a ON a.user_id = p.user_id AND a.achievement_type != 'degree'
        WHERE p.programme = ?
          AND (${likeFragments})
          ${filterClause.clause}
      `).get(programme, ...likeParams, ...filterClause.params);
      scores[bucket] = total ? Math.round(((row?.matched || 0) / total) * 100) / 100 : 0;
    }
    return { programme, total, scores };
  });
}

/**
 * Alumni count grouped by graduation year for the cohort-trend line chart.
 */
function getCohortTrend(filters) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  return db.prepare(`
    SELECT substr(p.graduation_date, 1, 4) AS year, COUNT(DISTINCT p.user_id) AS value
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE p.graduation_date IS NOT NULL
      ${filterClause.clause}
    GROUP BY year
    ORDER BY year ASC
  `).all(...filterClause.params);
}

/**
 * Distinct lookup data used to populate filter form selects.
 */
function getFilterOptions() {
  const programmes = db.prepare(`SELECT DISTINCT programme FROM profiles WHERE programme IS NOT NULL ORDER BY programme`).all().map((row) => row.programme);
  const sectors = db.prepare(`SELECT DISTINCT industry_sector FROM employment_history WHERE industry_sector IS NOT NULL ORDER BY industry_sector`).all().map((row) => row.industry_sector);
  const countries = db.prepare(`SELECT DISTINCT location_country FROM employment_history WHERE location_country IS NOT NULL ORDER BY location_country`).all().map((row) => row.location_country);
  return { programmes, sectors, countries };
}

/**
 * Paginated alumni directory listing. Excludes profiles with directory_visible=0.
 *
 * @param {object} filters Output of `readStandardFilters`.
 * @param {{page?: number, pageSize?: number}} pagination Pagination controls.
 */
function getAlumniDirectory(filters, pagination = {}) {
  const filterClause = buildFilterClause(filters, { profileAlias: 'p', employmentAlias: 'eh' });
  const page = Math.max(1, Number(pagination.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(pagination.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const rows = db.prepare(`
    SELECT p.user_id AS userId, p.first_name AS firstName, p.last_name AS lastName,
           p.programme, p.graduation_date AS graduationDate,
           eh.employer, eh.job_title AS jobTitle,
           eh.industry_sector AS industrySector,
           eh.location_country AS locationCountry,
           eh.location_city AS locationCity
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE COALESCE(p.directory_visible, 1) = 1
      ${filterClause.clause}
    ORDER BY p.last_name, p.first_name
    LIMIT ? OFFSET ?
  `).all(...filterClause.params, pageSize, offset);

  const total = db.prepare(`
    SELECT COUNT(DISTINCT p.user_id) AS total
    FROM profiles p
    LEFT JOIN employment_history eh ON eh.user_id = p.user_id AND eh.is_current = 1
    WHERE COALESCE(p.directory_visible, 1) = 1
      ${filterClause.clause}
  `).get(...filterClause.params)?.total || 0;

  return {
    page,
    pageSize,
    total,
    pageCount: Math.ceil(total / pageSize) || 1,
    rows,
  };
}

module.exports = {
  COVERAGE_KEYWORDS,
  getAlumniDirectory,
  getCohortTrend,
  getCurriculumCoverage,
  getEmploymentBySector,
  getFilterOptions,
  getGeographicDistribution,
  getProfessionalDevelopment,
  getSkillsGap,
  getSummary,
  getTopEmployers,
  getTopJobTitles,
};
