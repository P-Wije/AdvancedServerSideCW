const request = require('supertest');
const app = require('..');
const { createVerifiedUser, testEmail } = require('./helpers');
const { registerCleanup } = require('./setup');

describe('SSR page rendering', () => {
  registerCleanup();

  it('serves the public landing page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alumni Influencers');
  });

  it('serves the login page with a CSRF token field', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/name="_csrf"/);
  });

  it('serves the register page with role choices', async () => {
    const res = await request(app).get('/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('university_staff');
  });

  it('redirects unauthenticated requests away from /dashboard', async () => {
    const res = await request(app).get('/dashboard');
    expect([302, 401]).toContain(res.status);
  });

  it('logs in via SSR form and renders the analytics dashboard for staff', async () => {
    const email = testEmail('sample-staff');
    await createVerifiedUser({ email, password: 'StrongPassw0rd!', role: 'university_staff' });
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const csrf = (loginPage.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    expect(csrf).toBeTruthy();
    const submit = await agent.post('/login')
      .type('form')
      .send({ _csrf: csrf, email, password: 'StrongPassw0rd!' });
    expect(submit.status).toBe(302);
    expect(submit.headers.location).toBe('/dashboard');
    const dashboard = await agent.get('/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('Total alumni');
  });

  it('redirects alumni away from staff-only /analytics', async () => {
    const email = testEmail('sample-alumni');
    await createVerifiedUser({ email, password: 'StrongPassw0rd!', role: 'alumni' });
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const csrf = (loginPage.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await agent.post('/login')
      .type('form')
      .send({ _csrf: csrf, email, password: 'StrongPassw0rd!' });
    const res = await agent.get('/analytics');
    expect([302, 403]).toContain(res.status);
  });
});
