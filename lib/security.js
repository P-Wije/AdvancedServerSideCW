const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const PASSWORD_POLICY = 'Minimum 12 characters with uppercase, lowercase, number, and symbol.';

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createOpaqueTokenPair(bytes = 32) {
  const plain = generateOpaqueToken(bytes);
  return {
    plain,
    hash: hashToken(plain),
    prefix: plain.slice(0, 8),
  };
}

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left || '', 'utf8');
  const rightBuffer = Buffer.from(right || '', 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  PASSWORD_POLICY,
  comparePassword,
  createOpaqueTokenPair,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  isStrongPassword,
  safeCompare,
};
