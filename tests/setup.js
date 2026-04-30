// Registers a beforeEach hook that truncates every table so suites stay
// isolated. Imported per test file so the hook attaches to that file's Jest
// scope.
const db = require('../db');

function registerCleanup() {
  beforeEach(() => {
    db.prepare('DELETE FROM api_token_usage').run();
    db.prepare('DELETE FROM api_tokens').run();
    db.prepare('DELETE FROM analytics_filter_presets').run();
    db.prepare('DELETE FROM featured_slots').run();
    db.prepare('DELETE FROM bids').run();
    db.prepare('DELETE FROM alumni_event_participation').run();
    db.prepare('DELETE FROM employment_history').run();
    db.prepare('DELETE FROM achievements').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM users').run();
  });
}

module.exports = { registerCleanup };
