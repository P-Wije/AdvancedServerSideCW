const path = require('node:path');
const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');

require('./db');

const config = require('./lib/config');
const logger = require('./lib/logger');
const { specs, swaggerUi } = require('./lib/swagger');
const { startScheduler } = require('./lib/scheduler');
const {
  apiRateLimiter,
  attachCurrentUser,
  attachRequestContext,
  authRateLimiter,
  csrfProtection,
  csrfProtectionAfterMultipart,
  requireApiToken,
  requireRole,
  requireScopeOrRole,
  requireScopes,
  requireSession,
  requireVerifiedUser,
} = require('./lib/middleware');
const { flashMiddleware } = require('./lib/flash');
const { authValidators, validationHandler } = require('./lib/validators');
const { SCOPES } = require('./lib/scopes');

const authController = require('./controllers/authController');
const profileController = require('./controllers/profileController');
const biddingController = require('./controllers/biddingController');
const apiKeyController = require('./controllers/apiKeyController');
const publicApiController = require('./controllers/publicApiController');
const analyticsController = require('./controllers/analyticsController');
const alumniDirectoryController = require('./controllers/alumniDirectoryController');

const marketingController = require('./controllers/pages/marketingController');
const authPagesController = require('./controllers/pages/authPagesController');
const dashboardPagesController = require('./controllers/pages/dashboardController');
const profilePageController = require('./controllers/pages/profilePageController');
const biddingPageController = require('./controllers/pages/biddingPageController');
const apiKeyPageController = require('./controllers/pages/apiKeyPageController');
const alumniDirectoryPageController = require('./controllers/pages/alumniDirectoryPageController');
const analyticsPageController = require('./controllers/pages/analyticsPageController');

const SQLiteStore = SQLiteStoreFactory(session);
const app = express();

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(config.rootDir, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/base');

app.use(helmet({
  // CSP allows inline scripts and the Chart.js CDN while keeping other Helmet
  // defaults (frameguard, noSniff, HSTS) in place.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: config.clientOrigin,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use('/styles', express.static(path.join(config.rootDir, 'public', 'styles')));
app.use(express.static(path.join(config.rootDir, 'public')));

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: path.join(config.rootDir, 'data'),
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  unset: 'destroy',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.sessionMaxAgeMinutes * 60 * 1000,
  },
}));
app.use(attachRequestContext);
app.use(attachCurrentUser);
app.use(flashMiddleware);
app.use(csrfProtection);

// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ---------- SSR PUBLIC PAGES ----------
app.get('/', marketingController.showLandingPage);
app.get('/login', authPagesController.showLogin);
app.post('/login', authRateLimiter(), authPagesController.submitLogin);
app.post('/logout', authPagesController.submitLogout);
app.get('/register', authPagesController.showRegister);
app.post('/register', authRateLimiter(), authPagesController.submitRegister);
app.get('/forgot-password', authPagesController.showForgotPassword);
app.post('/forgot-password', authRateLimiter(), authPagesController.submitForgotPassword);
app.get('/reset-password', authPagesController.showResetPassword);
app.post('/reset-password', authRateLimiter(), authPagesController.submitResetPassword);
app.get('/verify-email', authPagesController.showVerifyEmail);

// ---------- SSR DASHBOARD ----------
app.get('/dashboard', requireSession, requireVerifiedUser, dashboardPagesController.showDashboard);

// ---------- SSR ALUMNI PAGES ----------
app.get('/profile', requireSession, requireVerifiedUser, requireRole('alumni'), profilePageController.showProfile);
app.post('/profile', requireSession, requireVerifiedUser, requireRole('alumni'), profilePageController.upload.single('profileImage'), csrfProtectionAfterMultipart, profilePageController.submitCoreProfile);
app.post('/profile/achievements', requireSession, requireVerifiedUser, requireRole('alumni'), profilePageController.submitAchievements);
app.post('/profile/employment', requireSession, requireVerifiedUser, requireRole('alumni'), profilePageController.submitEmployment);

app.get('/bidding', requireSession, requireVerifiedUser, requireRole('alumni'), biddingPageController.showBidding);
app.post('/bidding', requireSession, requireVerifiedUser, requireRole('alumni'), biddingPageController.submitBid);
app.post('/bidding/cancel/:id', requireSession, requireVerifiedUser, requireRole('alumni'), biddingPageController.cancelBid);
app.post('/bidding/event-participation', requireSession, requireVerifiedUser, requireRole('alumni'), biddingPageController.submitEventParticipation);

app.get('/developer/api-keys', requireSession, requireVerifiedUser, requireRole('alumni'), apiKeyPageController.showApiKeys);
app.post('/developer/api-keys', requireSession, requireVerifiedUser, requireRole('alumni'), apiKeyPageController.submitCreateApiKey);
app.get('/developer/api-keys/:id/usage', requireSession, requireVerifiedUser, requireRole('alumni'), apiKeyPageController.showApiKeyUsage);
app.post('/developer/api-keys/:id/revoke', requireSession, requireVerifiedUser, requireRole('alumni'), apiKeyPageController.submitRevokeApiKey);

// ---------- SSR UNIVERSITY-STAFF PAGES ----------
const staffOnly = [requireSession, requireVerifiedUser, requireRole('university_staff')];
app.get('/analytics', ...staffOnly, analyticsPageController.showHub);
app.get('/analytics/report.pdf', ...staffOnly, analyticsPageController.downloadReport);
app.get('/analytics/employment-sector', ...staffOnly, analyticsPageController.renderEmploymentSector);
app.get('/analytics/job-titles', ...staffOnly, analyticsPageController.renderJobTitles);
app.get('/analytics/top-employers', ...staffOnly, analyticsPageController.renderTopEmployers);
app.get('/analytics/geographic', ...staffOnly, analyticsPageController.renderGeographic);
app.get('/analytics/skills-gap', ...staffOnly, analyticsPageController.renderSkillsGap);
app.get('/analytics/professional-development', ...staffOnly, analyticsPageController.renderProfessionalDevelopment);
app.get('/analytics/curriculum-coverage', ...staffOnly, analyticsPageController.renderCurriculumCoverage);
app.get('/analytics/cohort-trend', ...staffOnly, analyticsPageController.renderCohortTrend);

app.get('/alumni', ...staffOnly, alumniDirectoryPageController.showDirectory);
app.post('/alumni/presets', ...staffOnly, alumniDirectoryPageController.submitFilterPreset);
app.post('/alumni/presets/:id/delete', ...staffOnly, alumniDirectoryPageController.deleteFilterPreset);

// ---------- LEGACY JSON API (kept for AJAX/Postman/AR clients) ----------
app.get('/auth/session', authController.sessionDetails);
app.post('/auth/register', authRateLimiter(), authValidators.register, validationHandler, authController.register);
app.post('/auth/resend-verification', authRateLimiter(), authValidators.forgotPassword, validationHandler, authController.resendVerification);
app.get('/auth/verify-email', authController.verifyEmail);
app.post('/auth/login', authRateLimiter(), authValidators.login, validationHandler, authController.login);
app.post('/auth/logout', requireSession, authController.logout);
app.post('/auth/forgot-password', authRateLimiter(), authValidators.forgotPassword, validationHandler, authController.forgotPassword);
app.post('/auth/reset-password', authRateLimiter(), authValidators.resetPassword, validationHandler, authController.resetPassword);

app.get('/profile/me', requireSession, requireVerifiedUser, profileController.getMyProfile);
app.put('/profile/me', requireSession, requireVerifiedUser, profileController.upload.single('profileImage'), csrfProtectionAfterMultipart, profileController.replaceCoreProfile);
app.put('/profile/me/achievements/:type', requireSession, requireVerifiedUser, profileController.replaceAchievementCollection);
app.put('/profile/me/employment-history', requireSession, requireVerifiedUser, profileController.replaceEmploymentHistory);

app.get('/bids/overview', requireSession, requireVerifiedUser, biddingController.overview);
app.get('/bids/history', requireSession, requireVerifiedUser, biddingController.history);
app.post('/bids', requireSession, requireVerifiedUser, authValidators.bid, validationHandler, biddingController.placeBid);
app.delete('/bids/:id', requireSession, requireVerifiedUser, biddingController.cancelBid);
app.post('/events/participation', requireSession, requireVerifiedUser, authValidators.eventParticipation, validationHandler, biddingController.registerEventParticipation);

app.get('/developer/api-keys.json', requireSession, requireVerifiedUser, apiKeyController.listApiKeys);
app.post('/developer/api-keys.json', requireSession, requireVerifiedUser, authValidators.apiKey, validationHandler, apiKeyController.createApiKey);
app.get('/developer/api-keys/:id/usage.json', requireSession, requireVerifiedUser, apiKeyController.getApiKeyUsage);
app.delete('/developer/api-keys/:id.json', requireSession, requireVerifiedUser, apiKeyController.revokeApiKey);

// ---------- BEARER-TOKEN PUBLIC API ----------
const bearerPipeline = [apiRateLimiter(), requireApiToken];
app.get('/api/public/featured/today', ...bearerPipeline, requireScopes(SCOPES.READ_ALUMNI_OF_DAY), publicApiController.getTodaysFeaturedAlumnus);

// ---------- ANALYTICS API ----------
// Accepts either a bearer token with `read:analytics` scope OR a logged-in
// university_staff session, so the SSR dashboard's "View JSON" / "Export CSV"
// links work against the same endpoints as Postman / the AR client.
const analyticsAuth = requireScopeOrRole({ scope: SCOPES.READ_ANALYTICS, roles: ['university_staff'] });
const analyticsPipeline = [apiRateLimiter(), analyticsAuth];
app.get('/api/analytics/summary', ...analyticsPipeline, analyticsController.summary);
app.get('/api/analytics/employment-by-sector', ...analyticsPipeline, analyticsController.employmentBySector);
app.get('/api/analytics/job-titles', ...analyticsPipeline, analyticsController.jobTitles);
app.get('/api/analytics/top-employers', ...analyticsPipeline, analyticsController.topEmployers);
app.get('/api/analytics/geographic', ...analyticsPipeline, analyticsController.geographic);
app.get('/api/analytics/skills-gap', ...analyticsPipeline, analyticsController.skillsGap);
app.get('/api/analytics/professional-development', ...analyticsPipeline, analyticsController.professionalDevelopment);
app.get('/api/analytics/curriculum-coverage', ...analyticsPipeline, analyticsController.curriculumCoverage);
app.get('/api/analytics/cohort-trend', ...analyticsPipeline, analyticsController.cohortTrend);

// Alumni directory requires the read:alumni scope (which the AR App preset
// lacks) or a university_staff session for in-browser access.
const alumniAuth = requireScopeOrRole({ scope: SCOPES.READ_ALUMNI, roles: ['university_staff'] });
app.get('/api/alumni', apiRateLimiter(), alumniAuth, alumniDirectoryController.listAlumni);

// ---------- API DOCS ----------
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// ---------- 404 + ERROR HANDLER ----------
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).render('not-found', { title: 'Not found' });
  }
  return res.status(404).json({ message: 'Endpoint not found.' });
});

app.use((error, req, res, next) => {
  if (error?.message === 'Profile image must be an image file.') {
    return res.status(400).json({ message: error.message });
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: `Profile images must be under ${Math.round(config.uploadMaxBytes / (1024 * 1024))}MB.` });
  }
  logger.error('Unhandled application error.', {
    error,
    method: req.method,
    path: req.originalUrl,
  });
  if (req.accepts('html')) {
    return res.status(500).render('not-found', { title: 'Server error' });
  }
  return res.status(500).json({ message: 'Unexpected server error.' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('Alumni Influencers API + dashboard started.', {
      baseUrl: config.appBaseUrl,
      environment: config.nodeEnv,
    });
  });
  startScheduler();
}

module.exports = app;
