const express = require('express');
const multer = require('multer');
const path = require('path');
const Profile = require('../models/Profile');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// GET profile form
router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    res.render('profile', { profile });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error', error: {} });
  }
});

// POST create/update profile
router.post('/', requireAuth, requireVerified, upload.single('profileImage'), async (req, res) => {
  try {
    const {
      firstName, lastName, biography, linkedinUrl,
      degreeTitles, degreeUrls, degreeDates,
      certTitles, certUrls, certDates,
      licenceTitles, licenceUrls, licenceDates,
      courseTitles, courseUrls, courseDates,
      positions, companies, startDates, endDates
    } = req.body;

    const profileData = {
      user: req.session.userId,
      firstName,
      lastName,
      biography,
      linkedinUrl,
      degrees: [],
      certifications: [],
      licences: [],
      courses: [],
      employmentHistory: []
    };

    if (req.file) {
      profileData.profileImage = '/uploads/' + req.file.filename;
    }

    // Process degrees
    if (degreeTitles && Array.isArray(degreeTitles)) {
      degreeTitles.forEach((title, i) => {
        if (title && degreeUrls[i] && degreeDates[i]) {
          profileData.degrees.push({
            title,
            url: degreeUrls[i],
            completionDate: new Date(degreeDates[i])
          });
        }
      });
    }

    // Process certifications
    if (certTitles && Array.isArray(certTitles)) {
      certTitles.forEach((title, i) => {
        if (title && certUrls[i] && certDates[i]) {
          profileData.certifications.push({
            title,
            url: certUrls[i],
            completionDate: new Date(certDates[i])
          });
        }
      });
    }

    // Process licences
    if (licenceTitles && Array.isArray(licenceTitles)) {
      licenceTitles.forEach((title, i) => {
        if (title && licenceUrls[i] && licenceDates[i]) {
          profileData.licences.push({
            title,
            url: licenceUrls[i],
            completionDate: new Date(licenceDates[i])
          });
        }
      });
    }

    // Process courses
    if (courseTitles && Array.isArray(courseTitles)) {
      courseTitles.forEach((title, i) => {
        if (title && courseUrls[i] && courseDates[i]) {
          profileData.courses.push({
            title,
            url: courseUrls[i],
            completionDate: new Date(courseDates[i])
          });
        }
      });
    }

    // Process employment
    if (positions && Array.isArray(positions)) {
      positions.forEach((position, i) => {
        if (position && companies[i] && startDates[i]) {
          profileData.employmentHistory.push({
            position,
            company: companies[i],
            startDate: new Date(startDates[i]),
            endDate: endDates[i] ? new Date(endDates[i]) : null
          });
        }
      });
    }

    await Profile.findOneAndUpdate(
      { user: req.session.userId },
      profileData,
      { upsert: true, new: true }
    );

    res.redirect('/profile');
  } catch (error) {
    res.status(500).render('error', { message: 'Server error', error: {} });
  }
});

// GET profile view (for alumni to view others)
router.get('/:id', async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.params.id }).populate('user', 'email');
    if (!profile) {
      return res.status(404).render('error', { message: 'Profile not found', error: {} });
    }
    res.render('view-profile', { profile });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error', error: {} });
  }
});

module.exports = router;
