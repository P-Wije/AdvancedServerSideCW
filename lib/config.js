const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = process.cwd();
const dataPath = process.env.DB_PATH || './data/alumni-influencers.sqlite';

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  dbPath: path.resolve(rootDir, dataPath),
  sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
  sessionMaxAgeMinutes: Number(process.env.SESSION_MAX_AGE_MINUTES || 30),
  universityEmailDomain: (process.env.UNIVERSITY_EMAIL_DOMAIN || 'eastminster.ac.uk').toLowerCase(),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  trustProxy: String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'University of Eastminster <no-reply@eastminster.ac.uk>',
  },
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_MB || 5) * 1024 * 1024,
};
