const db = require('../db');
const config = require('../lib/config');
const { hashPassword, createOpaqueTokenPair } = require('../lib/security');
const { CLIENT_PRESETS, serializeScopes } = require('../lib/scopes');

/** University email domain read from config so tests stay in sync with runtime. */
const TEST_DOMAIN = config.universityEmailDomain;
/** Builds a valid email address satisfying the domain restriction. */
const testEmail = (prefix) => `${prefix}@${TEST_DOMAIN}`;

/**
 * Creates a verified user directly in the DB so tests can skip the email
 * verification round-trip.
 *
 * @param {{email?: string, password?: string, role?: string}} opts
 */
async function createVerifiedUser(opts = {}) {
  const email = opts.email || testEmail('tester');
  const password = opts.password || 'StrongPassw0rd!';
  const role = opts.role || 'alumni';
  const passwordHash = await hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(email, passwordHash, role);
  return { id: result.lastInsertRowid, email, password, role };
}

/**
 * Creates an API token with the requested scope set and returns the plain
 * bearer string so tests can authenticate downstream requests.
 *
 * @param {number} userId Owning user id.
 * @param {Array<string>|string} scopes Scope list or preset name.
 */
function createApiToken(userId, scopes) {
  const finalScopes = Array.isArray(scopes) ? scopes : (CLIENT_PRESETS[scopes] || []);
  const tokenPair = createOpaqueTokenPair();
  db.prepare(`
    INSERT INTO api_tokens (created_by_user_id, name, token_prefix, token_hash, scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, 'Test token', tokenPair.prefix, tokenPair.hash, serializeScopes(finalScopes));
  return tokenPair.plain;
}

/**
 * Inserts a profile and a current employment row so analytics queries have
 * data to operate on.
 */
function seedAlumnusProfile(userId, overrides = {}) {
  const programme = overrides.programme || 'BSc Computer Science';
  const graduationDate = overrides.graduationDate || '2022-06-15';
  db.prepare(`
    INSERT INTO profiles (user_id, first_name, last_name, biography, linkedin_url, programme, graduation_date, directory_visible, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    userId,
    overrides.firstName || 'Test',
    overrides.lastName || 'Alumnus',
    overrides.biography || 'A test alumnus profile created by the test helper for analytics queries.',
    overrides.linkedinUrl || 'https://www.linkedin.com/in/test-alumnus',
    programme,
    graduationDate,
  );
  if (overrides.employment !== false) {
    db.prepare(`
      INSERT INTO employment_history (user_id, employer, job_title, start_date, end_date,
                                       industry_sector, location_country, location_city, is_current)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1)
    `).run(
      userId,
      overrides.employer || 'Phantasmagoria Ltd',
      overrides.jobTitle || 'Software Engineer',
      overrides.startDate || '2022-09-01',
      overrides.industrySector || 'Technology',
      overrides.locationCountry || 'United Kingdom',
      overrides.locationCity || 'London',
    );
  }
}

/**
 * Bootstraps an authenticated supertest agent: registers/seeds a user, signs
 * in via the SSR form, and exposes the CSRF token so JSON API tests can pass
 * the `x-csrf-token` header.
 *
 * @param {import('supertest').SuperTest<any>} requestAgent supertest's `request.agent(app)`.
 * @param {{email?: string, password?: string, role?: string}} userOpts User options.
 */
async function loginAgent(requestAgent, userOpts = {}) {
  const user = await createVerifiedUser(userOpts);
  const loginPage = await requestAgent.get('/login');
  const csrf = (loginPage.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  await requestAgent.post('/login').type('form').send({ _csrf: csrf, email: user.email, password: user.password });
  return { user, csrf };
}

/**
 * For tests calling JSON API endpoints without a logged-in session (e.g.
 * /auth/register), grab a CSRF token by hitting GET /auth/session first.
 *
 * @param {import('supertest').SuperTest<any>} requestAgent
 */
async function bootstrapCsrf(requestAgent) {
  const res = await requestAgent.get('/auth/session');
  return res.body.csrfToken;
}

module.exports = {
  TEST_DOMAIN,
  bootstrapCsrf,
  createApiToken,
  createVerifiedUser,
  loginAgent,
  seedAlumnusProfile,
  testEmail,
};
