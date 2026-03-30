const express = require('express');
const crypto = require('crypto');
const Token = require('../models/Token');
const Featured = require('../models/Featured');
const Profile = require('../models/Profile');
const { requireAuth, requireApiToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/featured:
 *   get:
 *     summary: Get today's featured alumnus
 *     tags: [Public API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Featured alumnus data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alumnus:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     profile:
 *                       type: object
 *                 bidAmount:
 *                   type: number
 *                 date:
 *                   type: string
 *                   format: date
 *       401:
 *         description: Unauthorized
 */

// Create API token
router.post('/tokens', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const tokenValue = crypto.randomBytes(32).toString('hex');

    const token = new Token({
      name,
      token: tokenValue,
      createdBy: req.session.userId
    });
    await token.save();

    res.status(201).json({ token: tokenValue });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List API tokens
router.get('/tokens', requireAuth, async (req, res) => {
  try {
    const tokens = await Token.find({ createdBy: req.session.userId });
    res.json(tokens.map(t => ({
      id: t._id,
      name: t.name,
      createdAt: t.createdAt,
      lastUsed: t.lastUsed,
      revoked: t.revoked,
      usageCount: t.usageLogs.length
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Revoke API token
router.delete('/tokens/:id', requireAuth, async (req, res) => {
  try {
    const token = await Token.findOne({
      _id: req.params.id,
      createdBy: req.session.userId
    });

    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    token.revoked = true;
    await token.save();

    res.json({ message: 'Token revoked' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Public API: Get today's featured alumnus
router.get('/featured', requireApiToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const featured = await Featured.findOne({ date: today }).populate({
      path: 'winner',
      select: 'email'
    });

    if (!featured) {
      return res.json({ message: 'No featured alumnus today' });
    }

    const profile = await Profile.findOne({ user: featured.winner._id });

    res.json({
      alumnus: {
        email: featured.winner.email,
        profile: profile ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          biography: profile.biography,
          linkedinUrl: profile.linkedinUrl,
          profileImage: profile.profileImage,
          degrees: profile.degrees,
          certifications: profile.certifications,
          licences: profile.licences,
          courses: profile.courses,
          employmentHistory: profile.employmentHistory
        } : null
      },
      bidAmount: featured.bidAmount,
      date: featured.date
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
