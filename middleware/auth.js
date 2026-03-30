const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

// Middleware to check if user is authenticated via session
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ message: 'Authentication required' });
  }
};

// Middleware to check if user is verified
const requireVerified = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (!user.verified) {
      return res.status(403).json({ message: 'Email not verified' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware for API token authentication
const requireApiToken = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'API token required' });
  }

  try {
    const Token = require('../models/Token');
    const tokenDoc = await Token.findOne({ token, revoked: false });
    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid or revoked token' });
    }

    // Log usage
    tokenDoc.usageLogs.push({
      endpoint: req.originalUrl,
      method: req.method,
      ip: req.ip
    });
    tokenDoc.lastUsed = new Date();
    await tokenDoc.save();

    req.apiToken = tokenDoc;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  requireAuth,
  requireVerified,
  requireApiToken
};
