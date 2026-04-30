const request = require('supertest');
const app = require('..');
const db = require('../db');
const { createApiToken, createVerifiedUser, seedAlumnusProfile, testEmail } = require('./helpers');
const { registerCleanup } = require('./setup');

describe('Alumni directory endpoint', () => {
  registerCleanup();

  it('lists alumni and respects pagination', async () => {
    const owner = await createVerifiedUser({ email: testEmail('owner'), role: 'university_staff' });
    const token = createApiToken(owner.id, ['read:alumni']);
    for (let i = 0; i < 8; i += 1) {
      const u = await createVerifiedUser({ email: testEmail(`dir${i}`) });
      seedAlumnusProfile(u.id);
    }
    const res = await request(app)
      .get('/api/alumni?pageSize=3&page=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(3);
    expect(res.body.rows.length).toBeLessThanOrEqual(3);
  });

  it('filters by industry sector', async () => {
    const owner = await createVerifiedUser({ email: testEmail('owner'), role: 'university_staff' });
    const token = createApiToken(owner.id, ['read:alumni']);
    const u1 = await createVerifiedUser({ email: testEmail('tech') });
    seedAlumnusProfile(u1.id, { industrySector: 'Technology' });
    const u2 = await createVerifiedUser({ email: testEmail('finance') });
    seedAlumnusProfile(u2.id, { industrySector: 'Finance' });
    const res = await request(app)
      .get('/api/alumni?sector=Finance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r) => r.industrySector === 'Finance')).toBe(true);
  });

  it('excludes profiles with directory_visible=0', async () => {
    const owner = await createVerifiedUser({ email: testEmail('owner'), role: 'university_staff' });
    const token = createApiToken(owner.id, ['read:alumni']);
    const visible = await createVerifiedUser({ email: testEmail('visible') });
    seedAlumnusProfile(visible.id);
    const hidden = await createVerifiedUser({ email: testEmail('hidden') });
    seedAlumnusProfile(hidden.id);
    db.prepare('UPDATE profiles SET directory_visible = 0 WHERE user_id = ?').run(hidden.id);
    const res = await request(app)
      .get('/api/alumni')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.rows.find((r) => r.userId === hidden.id)).toBeUndefined();
    expect(res.body.rows.find((r) => r.userId === visible.id)).toBeDefined();
  });
});
