const path = require('path');
const multer = require('multer');
const db = require('../db');
const config = require('../lib/config');
const { getProfileByUserId } = require('../lib/repositories');
const { normalizeProfilePayload, validateProfilePayload } = require('../lib/validators');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(config.rootDir, 'public', 'uploads')),
  filename: (req, file, cb) => {
    const safeExtension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `profile-${req.user.id}-${Date.now()}${safeExtension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.uploadMaxBytes,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Profile image must be an image file.'));
    }

    return cb(null, true);
  },
});

function getMyProfile(req, res) {
  const profile = getProfileByUserId(req.user.id);
  return res.json({
    profile,
  });
}

function saveProfile(req, res) {
  const profile = normalizeProfilePayload(req.body);
  const validationErrors = validateProfilePayload(profile);
  if (validationErrors.length) {
    return res.status(422).json({
      message: 'Profile validation failed.',
      errors: validationErrors,
    });
  }

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO profiles (user_id, first_name, last_name, biography, linkedin_url, profile_image_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        biography = excluded.biography,
        linkedin_url = excluded.linkedin_url,
        profile_image_path = COALESCE(excluded.profile_image_path, profiles.profile_image_path),
        updated_at = CURRENT_TIMESTAMP
    `).run(
      req.user.id,
      profile.firstName,
      profile.lastName,
      profile.biography,
      profile.linkedinUrl,
      imagePath,
    );

    db.prepare('DELETE FROM achievements WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM employment_history WHERE user_id = ?').run(req.user.id);

    const insertAchievement = db.prepare(`
      INSERT INTO achievements (user_id, achievement_type, title, reference_url, completion_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertEmployment = db.prepare(`
      INSERT INTO employment_history (user_id, employer, job_title, start_date, end_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    [
      ['degree', profile.degrees],
      ['certification', profile.certifications],
      ['licence', profile.licences],
      ['course', profile.courses],
    ].forEach(([type, entries]) => {
      entries.forEach((entry) => {
        insertAchievement.run(req.user.id, type, entry.title, entry.referenceUrl, entry.completionDate);
      });
    });

    profile.employmentHistory.forEach((entry) => {
      insertEmployment.run(req.user.id, entry.employer, entry.jobTitle, entry.startDate, entry.endDate || null);
    });
  });

  save();

  return res.json({
    message: 'Profile saved successfully.',
    profile: getProfileByUserId(req.user.id),
  });
}

module.exports = {
  getMyProfile,
  saveProfile,
  upload,
};
