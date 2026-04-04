const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./lib/config');

const dataDir = path.dirname(config.dbPath);
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified_at TEXT,
      verification_token_hash TEXT,
      verification_token_expires_at TEXT,
      reset_token_hash TEXT,
      reset_token_expires_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alumni_event_participation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      participated_on TEXT NOT NULL,
      grants_extra_slot_month TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, grants_extra_slot_month),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      biography TEXT NOT NULL,
      linkedin_url TEXT NOT NULL,
      profile_image_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_type TEXT NOT NULL CHECK (achievement_type IN ('degree', 'certification', 'licence', 'course')),
      title TEXT NOT NULL,
      reference_url TEXT NOT NULL,
      completion_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS employment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      employer TEXT NOT NULL,
      job_title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'won', 'lost', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, target_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS featured_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      bid_id INTEGER NOT NULL UNIQUE,
      bid_amount REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'active', 'completed')),
      selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      activated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL DEFAULT 'featured:read',
      revoked_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_token_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      http_method TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      response_status INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_token_id) REFERENCES api_tokens(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_achievements_user_type ON achievements(user_id, achievement_type);
    CREATE INDEX IF NOT EXISTS idx_employment_user ON employment_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_bids_target_status_amount ON bids(target_date, status, amount DESC, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_bids_user_target ON bids(user_id, target_date);
    CREATE INDEX IF NOT EXISTS idx_featured_slots_target_status ON featured_slots(target_date, status);
    CREATE INDEX IF NOT EXISTS idx_api_token_usage_token_created ON api_token_usage(api_token_id, created_at DESC);
  `);
}

initializeDatabase();

module.exports = db;
