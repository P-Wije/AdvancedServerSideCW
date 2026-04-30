const db = require('../../db');
const config = require('../../lib/config');
const logger = require('../../lib/logger');
const { sendMail } = require('../../lib/mailer');
const { getUserByEmail, getUserByResetTokenHash, getUserByVerificationTokenHash } = require('../../lib/repositories');
const { comparePassword, createOpaqueTokenPair, hashPassword, hashToken, isStrongPassword } = require('../../lib/security');
const { isoNow } = require('../../lib/time');
const { setFlash } = require('../../lib/flash');

const UNIVERSITY_DOMAIN = config.universityEmailDomain;

/**
 * Renders a thin redirect when the user is already authenticated to keep
 * /login and /register from showing forms while logged in.
 */
function redirectIfAuthenticated(req, res) {
  if (req.session.userId) {
    res.redirect('/dashboard');
    return true;
  }
  return false;
}

const showRegister = (req, res) => {
  if (redirectIfAuthenticated(req, res)) return;
  res.render('register', {
    title: 'Create your account',
    formValues: {},
    errors: [],
    universityDomain: UNIVERSITY_DOMAIN,
  });
};

const submitRegister = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const requestedRole = String(req.body.role || 'alumni').toLowerCase();
  const role = ['alumni', 'university_staff'].includes(requestedRole) ? requestedRole : 'alumni';
  const errors = [];

  if (!email.endsWith(`@${UNIVERSITY_DOMAIN}`)) {
    errors.push({ field: 'email', message: `Use your @${UNIVERSITY_DOMAIN} email address.` });
  }
  if (!isStrongPassword(password)) {
    errors.push({ field: 'password', message: 'Password must be at least 12 characters with upper, lower, number, and symbol.' });
  }
  if (getUserByEmail(email)) {
    errors.push({ field: 'email', message: 'That email is already registered.' });
  }
  if (errors.length) {
    return res.status(422).render('register', {
      title: 'Create your account',
      formValues: { email, role },
      errors,
      universityDomain: UNIVERSITY_DOMAIN,
    });
  }

  const verificationToken = createOpaqueTokenPair();
  const passwordHash = await hashPassword(password);
  db.prepare(`
    INSERT INTO users (email, password_hash, role, verification_token_hash, verification_token_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', '+24 hours'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(email, passwordHash, role, verificationToken.hash);

  const verificationUrl = `${config.appBaseUrl}/verify-email?token=${verificationToken.plain}`;
  await sendMail({
    to: email,
    subject: 'Verify your University of Eastminster account',
    html: `<p>Welcome to the Alumni Influencers platform.</p><p>Verify your email by visiting <a href="${verificationUrl}">${verificationUrl}</a>.</p>`,
    text: `Welcome to Alumni Influencers. Verify your email here: ${verificationUrl}`,
  });

  logger.info('Registered account via SSR.', { email, role });

  setFlash(req, 'success', 'Registration complete. Please check your email to verify your account.');
  return res.redirect('/login');
};

const showLogin = (req, res) => {
  if (redirectIfAuthenticated(req, res)) return;
  res.render('login', {
    title: 'Sign in',
    formValues: {},
    errors: [],
    next: typeof req.query.next === 'string' ? req.query.next : '',
  });
};

const submitLogin = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const next = typeof req.body.next === 'string' && req.body.next.startsWith('/') ? req.body.next : '';
  const user = getUserByEmail(email);
  const credentialsValid = user && await comparePassword(password, user.password_hash);

  if (!credentialsValid) {
    return res.status(401).render('login', {
      title: 'Sign in',
      formValues: { email },
      errors: [{ field: 'general', message: 'Invalid email or password.' }],
      next,
    });
  }

  if (!user.email_verified_at) {
    return res.status(403).render('login', {
      title: 'Sign in',
      formValues: { email },
      errors: [{ field: 'general', message: 'Please verify your email before signing in.' }],
      next,
    });
  }

  req.session.userId = user.id;
  req.session.lastAuthenticatedAt = isoNow();
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  logger.info('Authenticated session via SSR login form.', { userId: user.id, role: user.role });

  setFlash(req, 'success', 'Welcome back.');
  const destination = next || '/dashboard';
  return res.redirect(destination);
};

const submitLogout = (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((destroyError) => {
    if (destroyError) {
      logger.error('Logout failed while destroying session.', destroyError);
    } else {
      logger.info('Destroyed session via SSR logout.', { userId });
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};

const showVerifyEmail = (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.render('verify-email', {
      title: 'Verify email',
      message: 'Verification token is required.',
      success: false,
    });
  }

  const user = getUserByVerificationTokenHash(hashToken(token));
  if (!user) {
    return res.render('verify-email', {
      title: 'Verify email',
      message: 'Verification token is invalid or has expired.',
      success: false,
    });
  }

  db.prepare(`
    UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
           verification_token_hash = NULL,
           verification_token_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(user.id);

  logger.info('Verified email via SSR.', { userId: user.id });

  return res.render('verify-email', {
    title: 'Verify email',
    message: 'Email verified successfully. You can now sign in.',
    success: true,
  });
};

const showForgotPassword = (req, res) => {
  res.render('forgot-password', {
    title: 'Reset your password',
    sent: false,
    formValues: {},
  });
};

const submitForgotPassword = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = getUserByEmail(email);
  if (user) {
    const resetToken = createOpaqueTokenPair();
    db.prepare(`
      UPDATE users
         SET reset_token_hash = ?,
             reset_token_expires_at = datetime('now', '+1 hour'),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).run(resetToken.hash, user.id);

    const resetUrl = `${config.appBaseUrl}/reset-password?token=${resetToken.plain}`;
    await sendMail({
      to: email,
      subject: 'Reset your Alumni Influencers password',
      text: `Reset your password here: ${resetUrl}`,
    });
    logger.info('Issued password reset token via SSR.', { userId: user.id });
  }

  return res.render('forgot-password', {
    title: 'Reset your password',
    sent: true,
    formValues: { email },
  });
};

const showResetPassword = (req, res) => {
  res.render('reset-password', {
    title: 'Choose a new password',
    token: String(req.query.token || ''),
    errors: [],
  });
};

const submitResetPassword = async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  const errors = [];
  if (!isStrongPassword(password)) {
    errors.push({ field: 'password', message: 'Password must be at least 12 characters with upper, lower, number, and symbol.' });
  }
  const user = errors.length ? null : getUserByResetTokenHash(hashToken(token));
  if (!errors.length && !user) {
    errors.push({ field: 'general', message: 'Reset token is invalid or has expired.' });
  }
  if (errors.length) {
    return res.status(422).render('reset-password', {
      title: 'Choose a new password',
      token,
      errors,
    });
  }

  const passwordHash = await hashPassword(password);
  db.prepare(`
    UPDATE users
       SET password_hash = ?,
           reset_token_hash = NULL,
           reset_token_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(passwordHash, user.id);
  logger.info('Reset password via SSR.', { userId: user.id });

  setFlash(req, 'success', 'Password reset successful. You can now sign in.');
  return res.redirect('/login');
};

module.exports = {
  showLogin,
  showRegister,
  showVerifyEmail,
  showForgotPassword,
  showResetPassword,
  submitForgotPassword,
  submitLogin,
  submitLogout,
  submitRegister,
  submitResetPassword,
};
