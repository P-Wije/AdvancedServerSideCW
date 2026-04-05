const db = require('../db');
const config = require('../lib/config');
const { sendMail } = require('../lib/mailer');
const { getProfileByUserId, getUserByEmail, getUserById, getUserByResetTokenHash, getUserByVerificationTokenHash } = require('../lib/repositories');
const { comparePassword, createOpaqueTokenPair, hashPassword, hashToken } = require('../lib/security');
const { isoNow } = require('../lib/time');

async function register(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (getUserByEmail(email)) {
    return res.status(409).json({ message: 'That email is already registered.' });
  }

  const verificationToken = createOpaqueTokenPair();
  const passwordHash = await hashPassword(password);

  const insert = db.prepare(`
    INSERT INTO users (
      email,
      password_hash,
      verification_token_hash,
      verification_token_expires_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, datetime('now', '+24 hours'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const result = insert.run(email, passwordHash, verificationToken.hash);
  const verificationUrl = `${config.appBaseUrl}/verify-email.html?token=${verificationToken.plain}`;

  await sendMail({
    to: email,
    subject: 'Verify your University of Eastminster account',
    html: `<p>Welcome to Alumni Influencers.</p><p>Verify your email by visiting <a href="${verificationUrl}">${verificationUrl}</a>.</p>`,
    text: `Welcome to Alumni Influencers. Verify your email here: ${verificationUrl}`,
  });

  return res.status(201).json({
    message: 'Registration complete. Please check your email to verify your account.',
    userId: result.lastInsertRowid,
  });
}

async function verifyEmail(req, res) {
  const token = String(req.query.token || req.body.token || '').trim();
  if (!token) {
    return res.status(400).json({ message: 'Verification token is required.' });
  }

  const user = getUserByVerificationTokenHash(hashToken(token));
  if (!user) {
    return res.status(400).json({ message: 'Verification token is invalid or has expired.' });
  }

  db.prepare(`
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
        verification_token_hash = NULL,
        verification_token_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id);

  return res.json({ message: 'Email verified successfully.' });
}

async function resendVerification(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = getUserByEmail(email);
  if (!user) {
    return res.json({ message: 'If the account exists, a verification email has been sent.' });
  }

  if (user.email_verified_at) {
    return res.json({ message: 'This account is already verified.' });
  }

  const verificationToken = createOpaqueTokenPair();
  db.prepare(`
    UPDATE users
    SET verification_token_hash = ?,
        verification_token_expires_at = datetime('now', '+24 hours'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(verificationToken.hash, user.id);

  const verificationUrl = `${config.appBaseUrl}/verify-email.html?token=${verificationToken.plain}`;
  await sendMail({
    to: email,
    subject: 'Verify your University of Eastminster account',
    text: `Verify your email here: ${verificationUrl}`,
  });

  return res.json({ message: 'If the account exists, a verification email has been sent.' });
}

async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (!user.email_verified_at) {
    return res.status(403).json({ message: 'Please verify your email before logging in.' });
  }

  req.session.userId = user.id;
  req.session.lastAuthenticatedAt = isoNow();

  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  return res.json({
    message: 'Login successful.',
    user: {
      id: user.id,
      email: user.email,
      verified: Boolean(user.email_verified_at),
    },
    csrfToken: req.session.csrfToken,
  });
}

function logout(req, res) {
  req.session.destroy((destroyError) => {
    if (destroyError) {
      console.error('Logout failed while destroying session:', destroyError);
      return res.status(500).json({ message: 'Logout failed. Please try again.' });
    }

    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully.' });
  });
}

async function forgotPassword(req, res) {
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

    const resetUrl = `${config.appBaseUrl}/reset-password.html?token=${resetToken.plain}`;
    await sendMail({
      to: email,
      subject: 'Reset your Alumni Influencers password',
      text: `Reset your password here: ${resetUrl}`,
    });
  }

  return res.json({ message: 'If the email exists, a password reset message has been sent.' });
}

async function resetPassword(req, res) {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  const user = getUserByResetTokenHash(hashToken(token));

  if (!user) {
    return res.status(400).json({ message: 'Reset token is invalid or has expired.' });
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

  return res.json({ message: 'Password reset successful. You can now sign in.' });
}

function sessionDetails(req, res) {
  const userId = req.session.userId;
  if (!userId) {
    return res.json({
      authenticated: false,
      csrfToken: req.session.csrfToken,
    });
  }

  const user = getUserById(userId);
  const currentUser = user ? {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.email_verified_at,
    lastLoginAt: user.last_login_at,
  } : null;
  const profile = currentUser ? getProfileByUserId(userId) : null;

  return res.json({
    authenticated: Boolean(currentUser),
    csrfToken: req.session.csrfToken,
    user: currentUser ? {
      id: currentUser.id,
      email: currentUser.email,
      verified: Boolean(currentUser.emailVerifiedAt),
      lastLoginAt: currentUser.lastLoginAt,
      profileComplete: Boolean(profile),
    } : null,
  });
}

module.exports = {
  forgotPassword,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  sessionDetails,
  verifyEmail,
};
