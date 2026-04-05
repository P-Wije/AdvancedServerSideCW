const path = require('node:path');
const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

require('./db');

const config = require('./lib/config');
const { specs, swaggerUi } = require('./lib/swagger');
const { startScheduler } = require('./lib/scheduler');
const { apiRateLimiter, attachRequestContext, authRateLimiter, csrfProtection, requireApiToken, requireSession, requireVerifiedUser } = require('./lib/middleware');
const { authValidators, validationHandler } = require('./lib/validators');
const authController = require('./controllers/authController');
const profileController = require('./controllers/profileController');
const biddingController = require('./controllers/biddingController');
const apiKeyController = require('./controllers/apiKeyController');
const publicApiController = require('./controllers/publicApiController');

const SQLiteStore = SQLiteStoreFactory(session);
const app = express();

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(helmet({
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
app.use(csrfProtection);

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/auth/session', authController.sessionDetails);
app.post('/auth/register', authRateLimiter(), authValidators.register, validationHandler, authController.register);
app.post('/auth/resend-verification', authRateLimiter(), authValidators.forgotPassword, validationHandler, authController.resendVerification);
app.get('/auth/verify-email', authController.verifyEmail);
app.post('/auth/login', authRateLimiter(), authValidators.login, validationHandler, authController.login);
app.post('/auth/logout', requireSession, authController.logout);
app.post('/auth/forgot-password', authRateLimiter(), authValidators.forgotPassword, validationHandler, authController.forgotPassword);
app.post('/auth/reset-password', authRateLimiter(), authValidators.resetPassword, validationHandler, authController.resetPassword);

app.get('/profile/me', requireSession, requireVerifiedUser, profileController.getMyProfile);
app.post('/profile/me', requireSession, requireVerifiedUser, profileController.upload.single('profileImage'), profileController.saveProfile);

app.get('/bids/overview', requireSession, requireVerifiedUser, biddingController.overview);
app.get('/bids/history', requireSession, requireVerifiedUser, biddingController.history);
app.post('/bids', requireSession, requireVerifiedUser, authValidators.bid, validationHandler, biddingController.placeBid);
app.delete('/bids/:id', requireSession, requireVerifiedUser, biddingController.cancelBid);
app.post('/events/participation', requireSession, requireVerifiedUser, authValidators.eventParticipation, validationHandler, biddingController.registerEventParticipation);

app.get('/developer/api-keys', requireSession, requireVerifiedUser, apiKeyController.listApiKeys);
app.post('/developer/api-keys', requireSession, requireVerifiedUser, authValidators.apiKey, validationHandler, apiKeyController.createApiKey);
app.get('/developer/api-keys/:id/usage', requireSession, requireVerifiedUser, apiKeyController.getApiKeyUsage);
app.delete('/developer/api-keys/:id', requireSession, requireVerifiedUser, apiKeyController.revokeApiKey);

app.get('/api/public/featured/today', apiRateLimiter(), requireApiToken, publicApiController.getTodaysFeaturedAlumnus);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

app.use((error, req, res, next) => {
  if (error?.message === 'Profile image must be an image file.') {
    return res.status(400).json({ message: error.message });
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: `Profile images must be under ${Math.round(config.uploadMaxBytes / (1024 * 1024))}MB.` });
  }

  console.error(error);
  return res.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(config.port, () => {
  console.log(`Alumni Influencers API listening on ${config.appBaseUrl}`);
});

startScheduler();

module.exports = app;
