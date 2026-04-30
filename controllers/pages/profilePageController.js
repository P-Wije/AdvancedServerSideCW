const path = require('node:path');
const multer = require('multer');
const db = require('../../db');
const config = require('../../lib/config');
const logger = require('../../lib/logger');
const { setFlash } = require('../../lib/flash');
const { getProfileByUserId } = require('../../lib/repositories');
const { sanitizeText } = require('../../lib/validators');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(config.rootDir, 'public', 'uploads')),
  filename: (req, file, cb) => {
    const safeExtension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `profile-${req.user.id}-${Date.now()}${safeExtension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxBytes },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Profile image must be an image file.'));
    }
    return cb(null, true);
  },
});

/**
 * Builds an array of rows for the profile form by zipping repeated form fields.
 *
 * The HTML form uses `degrees[0][title]`, `degrees[0][referenceUrl]`, etc.
 * Express body-parser delivers these as nested objects keyed by index, which
 * are flattened to a clean array. Empty/blank rows are dropped by callers.
 *
 * @param {Record<string, unknown>|undefined} group Sub-object from req.body.
 * @returns {Array<object>}
 */
function rowsFromIndexedGroup(group) {
  if (!group || typeof group !== 'object') return [];
  return Object.keys(group)
    .sort((a, b) => Number(a) - Number(b))
    .map((idx) => group[idx])
    .filter((row) => row && typeof row === 'object');
}

const showProfile = (req, res) => {
  const profile = getProfileByUserId(req.user.id);
  res.render('profile', {
    title: 'My profile',
    profile,
    errors: [],
  });
};

const submitCoreProfile = (req, res) => {
  const errors = [];
  const payload = {
    firstName: sanitizeText(req.body.firstName),
    lastName: sanitizeText(req.body.lastName),
    biography: sanitizeText(req.body.biography),
    linkedinUrl: String(req.body.linkedinUrl || '').trim(),
    programme: sanitizeText(req.body.programme),
    graduationDate: String(req.body.graduationDate || '').trim() || null,
    directoryVisible: req.body.directoryVisible === 'on' || req.body.directoryVisible === 'true' ? 1 : 0,
  };

  if (!payload.firstName) errors.push({ field: 'firstName', message: 'First name is required.' });
  if (!payload.lastName) errors.push({ field: 'lastName', message: 'Last name is required.' });
  if (!payload.biography || payload.biography.length < 30) errors.push({ field: 'biography', message: 'Biography must be at least 30 characters.' });
  if (!payload.linkedinUrl || !payload.linkedinUrl.includes('linkedin.com')) errors.push({ field: 'linkedinUrl', message: 'A valid LinkedIn URL is required.' });
  if (payload.graduationDate && Number.isNaN(Date.parse(payload.graduationDate))) errors.push({ field: 'graduationDate', message: 'Graduation date must be a valid date.' });

  if (errors.length) {
    return res.status(422).render('profile', {
      title: 'My profile',
      profile: { ...getProfileByUserId(req.user.id), ...payload },
      errors,
    });
  }

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO profiles (user_id, first_name, last_name, biography, linkedin_url, profile_image_path,
                          programme, graduation_date, directory_visible, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      biography = excluded.biography,
      linkedin_url = excluded.linkedin_url,
      profile_image_path = COALESCE(excluded.profile_image_path, profiles.profile_image_path),
      programme = excluded.programme,
      graduation_date = excluded.graduation_date,
      directory_visible = excluded.directory_visible,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    req.user.id,
    payload.firstName,
    payload.lastName,
    payload.biography,
    payload.linkedinUrl,
    imagePath,
    payload.programme || null,
    payload.graduationDate,
    payload.directoryVisible,
  );
  logger.info('Core profile updated via SSR.', { userId: req.user.id });
  setFlash(req, 'success', 'Profile saved.');
  return res.redirect('/profile');
};

const submitAchievements = (req, res) => {
  const types = ['degree', 'certification', 'licence', 'course'];
  const replace = db.transaction(() => {
    for (const type of types) {
      const groupKey = `${type}s`; // form field name for plurals
      const rows = rowsFromIndexedGroup(req.body[groupKey])
        .map((row) => ({
          title: sanitizeText(row.title),
          referenceUrl: String(row.referenceUrl || '').trim(),
          completionDate: String(row.completionDate || '').trim(),
        }))
        .filter((row) => row.title || row.referenceUrl || row.completionDate);

      db.prepare('DELETE FROM achievements WHERE user_id = ? AND achievement_type = ?').run(req.user.id, type);

      const insert = db.prepare(`
        INSERT INTO achievements (user_id, achievement_type, title, reference_url, completion_date)
        VALUES (?, ?, ?, ?, ?)
      `);

      rows.forEach((row) => {
        if (!row.title || !row.referenceUrl || !row.completionDate) return;
        insert.run(req.user.id, type, row.title, row.referenceUrl, row.completionDate);
      });
    }
  });
  replace();
  setFlash(req, 'success', 'Achievements updated.');
  return res.redirect('/profile');
};

const submitEmployment = (req, res) => {
  const rows = rowsFromIndexedGroup(req.body.employmentHistory)
    .map((row) => ({
      employer: sanitizeText(row.employer),
      jobTitle: sanitizeText(row.jobTitle),
      startDate: String(row.startDate || '').trim(),
      endDate: String(row.endDate || '').trim(),
      industrySector: sanitizeText(row.industrySector),
      locationCountry: sanitizeText(row.locationCountry),
      locationCity: sanitizeText(row.locationCity),
    }))
    .filter((row) => row.employer || row.jobTitle || row.startDate);

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM employment_history WHERE user_id = ?').run(req.user.id);
    const insert = db.prepare(`
      INSERT INTO employment_history (user_id, employer, job_title, start_date, end_date,
                                       industry_sector, location_country, location_city, is_current)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((row) => {
      if (!row.employer || !row.jobTitle || !row.startDate) return;
      const isCurrent = !row.endDate ? 1 : 0;
      insert.run(
        req.user.id,
        row.employer,
        row.jobTitle,
        row.startDate,
        row.endDate || null,
        row.industrySector || null,
        row.locationCountry || null,
        row.locationCity || null,
        isCurrent,
      );
    });
  });
  replace();
  setFlash(req, 'success', 'Employment history updated.');
  return res.redirect('/profile');
};

module.exports = {
  showProfile,
  submitAchievements,
  submitCoreProfile,
  submitEmployment,
  upload,
};
