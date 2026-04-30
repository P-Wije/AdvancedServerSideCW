const request = require('supertest');
const app = require('..');
const db = require('../db');
const { bootstrapCsrf, testEmail, TEST_DOMAIN } = require('./helpers');
const { registerCleanup } = require('./setup');

describe('Authentication & registration (JSON API)', () => {
  registerCleanup();

  function jsonAgent() {
    return request.agent(app);
  }

  it('rejects non-university email addresses on JSON registration', async () => {
    const agent = jsonAgent();
    const csrf = await bootstrapCsrf(agent);
    const res = await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'someone@gmail.com', password: 'StrongPassw0rd!' });
    expect(res.status).toBe(422);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('rejects weak passwords', async () => {
    const agent = jsonAgent();
    const csrf = await bootstrapCsrf(agent);
    const res = await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: testEmail('okay'), password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('accepts a valid registration and creates an unverified user', async () => {
    const agent = jsonAgent();
    const csrf = await bootstrapCsrf(agent);
    const email = testEmail('happy');
    const res = await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email, password: 'StrongPassw0rd!' });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT email, role, email_verified_at FROM users WHERE email = ?').get(email);
    expect(row).toBeDefined();
    expect(row.role).toBe('alumni');
    expect(row.email_verified_at).toBeNull();
  });

  it('honours the role field on registration', async () => {
    const agent = jsonAgent();
    const csrf = await bootstrapCsrf(agent);
    const email = testEmail('staff');
    await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email, password: 'StrongPassw0rd!', role: 'university_staff' });
    const row = db.prepare('SELECT role FROM users WHERE email = ?').get(email);
    expect(row.role).toBe('university_staff');
  });

  it('refuses login until email is verified', async () => {
    const agent = jsonAgent();
    const csrf = await bootstrapCsrf(agent);
    const email = testEmail('pending');
    await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email, password: 'StrongPassw0rd!' });
    const res = await agent
      .post('/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email, password: 'StrongPassw0rd!' });
    expect(res.status).toBe(403);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: testEmail('noCsrf'), password: 'StrongPassw0rd!' });
    expect(res.status).toBe(403);
  });

  it('uses the configured university email domain', () => {
    expect(typeof TEST_DOMAIN).toBe('string');
    expect(TEST_DOMAIN.length).toBeGreaterThan(0);
  });
});
