const request = require('supertest');
const app = require('..');
const { createApiToken, createVerifiedUser, seedAlumnusProfile, testEmail } = require('./helpers');
const { registerCleanup } = require('./setup');

async function bootstrapAnalytics() {
  const owner = await createVerifiedUser({ email: testEmail('analytics-owner'), role: 'university_staff' });
  const token = createApiToken(owner.id, 'analytics_dashboard');
  const programmes = ['BSc Computer Science', 'BSc Business Management'];
  const sectors = ['Technology', 'Finance'];
  let nextId = 200;
  for (let i = 0; i < 6; i += 1) {
    const u = await createVerifiedUser({ email: testEmail(`seed${i}`) });
    seedAlumnusProfile(u.id, {
      programme: programmes[i % programmes.length],
      industrySector: sectors[i % sectors.length],
      employer: i < 3 ? 'Phantasmagoria Ltd' : `Employer ${nextId++}`,
      jobTitle: i % 2 === 0 ? 'Software Engineer' : 'Analyst',
      graduationDate: `${2020 + (i % 4)}-06-15`,
      locationCountry: i % 3 === 0 ? 'United States' : 'United Kingdom',
    });
  }
  return { token };
}

describe('Analytics JSON endpoints', () => {
  registerCleanup();
  let token;
  beforeEach(async () => {
    ({ token } = await bootstrapAnalytics());
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('returns summary KPIs', async () => {
    const res = await auth(request(app).get('/api/analytics/summary'));
    expect(res.status).toBe(200);
    expect(res.body.summary.totalAlumni).toBeGreaterThanOrEqual(6);
    expect(res.body.summary.programmesCount).toBe(2);
  });

  it('returns employment-by-sector with sectors sorted descending', async () => {
    const res = await auth(request(app).get('/api/analytics/employment-by-sector'));
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(2);
    const values = res.body.rows.map((r) => r.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('respects programme filter on top-employers', async () => {
    const res = await auth(request(app).get('/api/analytics/top-employers?programme=BSc%20Computer%20Science'));
    expect(res.status).toBe(200);
    expect(res.body.filters.programme).toBe('BSc Computer Science');
  });

  it('emits CSV when format=csv', async () => {
    const res = await auth(request(app).get('/api/analytics/employment-by-sector?format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('label');
  });

  it('returns geographic distribution including USA', async () => {
    const res = await auth(request(app).get('/api/analytics/geographic'));
    expect(res.status).toBe(200);
    expect(res.body.rows.find((r) => r.label === 'United States')).toBeDefined();
  });

  it('returns curriculum coverage with score buckets', async () => {
    const res = await auth(request(app).get('/api/analytics/curriculum-coverage'));
    expect(res.status).toBe(200);
    if (res.body.rows.length) {
      const buckets = Object.keys(res.body.rows[0].scores);
      expect(buckets).toEqual(expect.arrayContaining(['cloud', 'security', 'data', 'design', 'management', 'agile']));
    }
  });

  it('returns cohort trend grouped by year', async () => {
    const res = await auth(request(app).get('/api/analytics/cohort-trend'));
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r) => /^\d{4}$/.test(r.year))).toBe(true);
  });
});
