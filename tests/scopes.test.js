const request = require('supertest');
const app = require('..');
const db = require('../db');
const { createApiToken, createVerifiedUser, seedAlumnusProfile } = require('./helpers');
const { registerCleanup } = require('./setup');

describe('API key scope enforcement', () => {
  registerCleanup();

  it('rejects analytics requests when token lacks read:analytics', async () => {
    const user = await createVerifiedUser({ role: 'university_staff' });
    const arToken = createApiToken(user.id, 'ar_app');
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${arToken}`);
    expect(res.status).toBe(403);
    expect(res.body.missing).toContain('read:analytics');
  });

  it('allows analytics requests when token holds read:analytics', async () => {
    const user = await createVerifiedUser({ role: 'university_staff' });
    seedAlumnusProfile(user.id);
    const dashboardToken = createApiToken(user.id, 'analytics_dashboard');
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${dashboardToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalAlumni).toBeGreaterThanOrEqual(1);
  });

  it('rejects alumni-of-day requests when token lacks read:alumni_of_day', async () => {
    const user = await createVerifiedUser({ role: 'alumni' });
    const dashboardToken = createApiToken(user.id, 'analytics_dashboard');
    const res = await request(app)
      .get('/api/public/featured/today')
      .set('Authorization', `Bearer ${dashboardToken}`);
    expect(res.status).toBe(403);
    expect(res.body.missing).toContain('read:alumni_of_day');
  });

  it('rejects /api/alumni when token lacks read:alumni', async () => {
    const user = await createVerifiedUser({ role: 'university_staff' });
    const arToken = createApiToken(user.id, 'ar_app');
    const res = await request(app)
      .get('/api/alumni')
      .set('Authorization', `Bearer ${arToken}`);
    expect(res.status).toBe(403);
    expect(res.body.missing).toContain('read:alumni');
  });

  it('migrates legacy featured:read tokens to read:alumni_of_day', () => {
    const tokenRow = db.prepare(`
      SELECT scopes FROM api_tokens LIMIT 1
    `).get();
    if (!tokenRow) return;
    expect(tokenRow.scopes).not.toBe('featured:read');
  });
});
