const request = require('supertest');
const app = require('..');
const { loginAgent, testEmail } = require('./helpers');
const { registerCleanup } = require('./setup');

describe('API key creation via JSON endpoint', () => {
  registerCleanup();

  it('rejects unknown scopes with 422', async () => {
    const agent = request.agent(app);
    const { csrf } = await loginAgent(agent, { email: testEmail('k1'), password: 'StrongPassw0rd!', role: 'alumni' });
    const res = await agent.post('/developer/api-keys.json')
      .set('x-csrf-token', csrf)
      .send({ name: 'Custom integration key', scopes: ['read:fictional'] });
    expect(res.status).toBe(422);
  });

  it('accepts a known scope set and returns the plain token once', async () => {
    const agent = request.agent(app);
    const { csrf } = await loginAgent(agent, { email: testEmail('k2'), password: 'StrongPassw0rd!', role: 'alumni' });
    const res = await agent.post('/developer/api-keys.json')
      .set('x-csrf-token', csrf)
      .send({ name: 'Mobile AR key', scopes: ['read:alumni_of_day'] });
    expect(res.status).toBe(201);
    expect(res.body.apiKey.token).toMatch(/^[0-9a-f]+$/);
    expect(res.body.apiKey.scopes).toBe('read:alumni_of_day');
  });

  it('falls back to the analytics_dashboard preset when scopes are absent', async () => {
    const agent = request.agent(app);
    const { csrf } = await loginAgent(agent, { email: testEmail('k3'), password: 'StrongPassw0rd!', role: 'alumni' });
    const res = await agent.post('/developer/api-keys.json')
      .set('x-csrf-token', csrf)
      .send({ name: 'Preset key', clientPreset: 'analytics_dashboard' });
    expect(res.status).toBe(201);
    expect(res.body.apiKey.scopes).toContain('read:alumni');
    expect(res.body.apiKey.scopes).toContain('read:analytics');
  });
});
