const path = require('node:path');
const multer = require('multer');
const db = require('../db');
const config = require('../lib/config');
const logger = require('../lib/logger');
const { getProfileByUserId } = require('../lib/repositories');
const { normalizeAchievement, normalizeEmployment, sanitizeText } = require('../lib/validators');

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

const validAchievementTypes = new Set(['degree', 'certification', 'licence', 'course']);

/**
 * Validates that a string is a valid absolute HTTP(S) URL.
 *
 * @param {string} value Candidate URL value.
 * @returns {boolean} True when the value is a valid HTTP(S) URL.
 */
function isHttpUrl(value) {
  if (!URL.canParse(value)) {
    return false;
  }

  const parsed = new URL(value);
  return ['http:', 'https:'].includes(parsed.protocol);
}

/**
 * Parses a request field into an array for collection replacement endpoints.
 *
 * @param {unknown} value Request body value.
 * @returns {Array<unknown>|null} Parsed array, empty array, or null when invalid JSON is supplied.
 */
function parseCollectionPayload(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      logger.warn('Failed to parse collection payload.', { error: error.message });
      return null;
    }
  }

  return [];
}

/**
 * Validates the core one-to-one profile resource payload.
 *
 * @param {{firstName: string, lastName: string, biography: string, linkedinUrl: string, programme?: string, graduationDate?: string}} payload Core profile payload.
 * @returns {Array<{field: string, message: string}>} Validation error list.
 */
function validateCoreProfile(payload) {
  const errors = [];

  if (!payload.firstName || payload.firstName.length > 80) {
    errors.push({ field: 'firstName', message: 'First name is required and must be under 80 characters.' });
  }
  if (!payload.lastName || payload.lastName.length > 80) {
    errors.push({ field: 'lastName', message: 'Last name is required and must be under 80 characters.' });
  }
  if (!payload.biography || payload.biography.length < 30 || payload.biography.length > 1200) {
    errors.push({ field: 'biography', message: 'Biography must be between 30 and 1200 characters.' });
  }
  if (!isHttpUrl(payload.linkedinUrl) || !payload.linkedinUrl.includes('linkedin.com')) {
    errors.push({ field: 'linkedinUrl', message: 'Provide a valid LinkedIn profile URL.' });
  }
  if (payload.programme && payload.programme.length > 120) {
    errors.push({ field: 'programme', message: 'Programme name must be under 120 characters.' });
  }
  if (payload.graduationDate && Number.isNaN(Date.parse(payload.graduationDate))) {
    errors.push({ field: 'graduationDate', message: 'Graduation date must be a valid date.' });
  }

  return errors;
}

/**
 * Validates a normalized achievement collection replacement payload.
 *
 * @param {Array<{title: string, referenceUrl: string, completionDate: string}>} entries Normalized entries.
 * @param {string} fieldName Prefix used in validation field names.
 * @returns {Array<{field: string, message: string}>} Validation error list.
 */
function validateAchievementCollection(entries, fieldName) {
  const errors = [];

  entries.forEach((entry, index) => {
    if (!entry.title) {
      errors.push({ field: `${fieldName}[${index}].title`, message: 'Title is required.' });
    }
    if (!isHttpUrl(entry.referenceUrl)) {
      errors.push({ field: `${fieldName}[${index}].referenceUrl`, message: 'A valid URL is required.' });
    }
    if (!entry.completionDate || Number.isNaN(Date.parse(entry.completionDate))) {
      errors.push({ field: `${fieldName}[${index}].completionDate`, message: 'A valid completion date is required.' });
    }
  });

  return errors;
}

/**
 * Validates a normalized employment history replacement payload.
 *
 * @param {Array<{employer: string, jobTitle: string, startDate: string, endDate: string}>} entries Normalized entries.
 * @returns {Array<{field: string, message: string}>} Validation error list.
 */
function validateEmploymentCollection(entries) {
  const errors = [];

  entries.forEach((entry, index) => {
    if (!entry.employer) {
      errors.push({ field: `employmentHistory[${index}].employer`, message: 'Employer is required.' });
    }
    if (!entry.jobTitle) {
      errors.push({ field: `employmentHistory[${index}].jobTitle`, message: 'Job title is required.' });
    }
    if (!entry.startDate || Number.isNaN(Date.parse(entry.startDate))) {
      errors.push({ field: `employmentHistory[${index}].startDate`, message: 'A valid start date is required.' });
    }
    if (entry.endDate && Number.isNaN(Date.parse(entry.endDate))) {
      errors.push({ field: `employmentHistory[${index}].endDate`, message: 'End date must be a valid date.' });
    }
    if (entry.endDate && entry.startDate && new Date(entry.endDate) < new Date(entry.startDate)) {
      errors.push({ field: `employmentHistory[${index}].endDate`, message: 'End date cannot be earlier than start date.' });
    }
  });

  return errors;
}

/**
 * Returns the aggregated signed-in alumni profile.
 */
function getMyProfile(req, res) {
  return res.json({
    profile: getProfileByUserId(req.user.id),
  });
}

/**
 * Replaces the core profile resource and optional profile image.
 */
function replaceCoreProfile(req, res) {
  const payload = {
    firstName: sanitizeText(req.body.firstName),
    lastName: sanitizeText(req.body.lastName),
    biography: sanitizeText(req.body.biography),
    linkedinUrl: String(req.body.linkedinUrl || '').trim(),
    programme: sanitizeText(req.body.programme),
    graduationDate: String(req.body.graduationDate || '').trim(),
    directoryVisible: req.body.directoryVisible === false || req.body.directoryVisible === 'false' ? 0 : 1,
  };

  const validationErrors = validateCoreProfile(payload);
  if (validationErrors.length) {
    return res.status(422).json({
      message: 'Profile validation failed.',
      errors: validationErrors,
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
    payload.graduationDate || null,
    payload.directoryVisible,
  );

  logger.info('Updated core alumni profile.', {
    userId: req.user.id,
    hasImageUpload: Boolean(imagePath),
    programme: payload.programme || null,
  });

  return res.json({
    message: 'Core profile updated successfully.',
    profile: getProfileByUserId(req.user.id),
  });
}

/**
 * Replaces one achievement collection such as degrees or certifications.
 */
function replaceAchievementCollection(req, res) {
  const achievementType = req.params.type;
  if (!validAchievementTypes.has(achievementType)) {
    return res.status(400).json({ message: 'Invalid achievement type.' });
  }

  const entries = parseCollectionPayload(req.body.entries);
  if (entries === null) {
    return res.status(422).json({
      message: 'Entries must be a valid JSON array.',
      errors: [{ field: 'entries', message: 'Entries must be a valid JSON array.' }],
    });
  }

  const normalizedEntries = entries.map(normalizeAchievement);
  const validationErrors = validateAchievementCollection(normalizedEntries, 'entries');
  if (validationErrors.length) {
    return res.status(422).json({
      message: 'Achievement validation failed.',
      errors: validationErrors,
    });
  }

  const replaceCollection = db.transaction(() => {
    db.prepare('DELETE FROM achievements WHERE user_id = ? AND achievement_type = ?').run(req.user.id, achievementType);

    const insertAchievement = db.prepare(`
      INSERT INTO achievements (user_id, achievement_type, title, reference_url, completion_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    normalizedEntries.forEach((entry) => {
      insertAchievement.run(req.user.id, achievementType, entry.title, entry.referenceUrl, entry.completionDate);
    });
  });

  replaceCollection();

  logger.info('Replaced achievement collection.', {
    userId: req.user.id,
    achievementType,
    entryCount: normalizedEntries.length,
  });

  return res.json({
    message: `${achievementType} entries updated successfully.`,
    profile: getProfileByUserId(req.user.id),
  });
}

/**
 * Replaces the employment history collection for the signed-in user.
 *
 * Each row gets its `is_current` flag derived from the absence of an end date.
 * Together with `industry_sector` and `location_*` columns, this powers the
 * analytics dashboard queries.
 */
function replaceEmploymentHistory(req, res) {
  const entries = parseCollectionPayload(req.body.entries);
  if (entries === null) {
    return res.status(422).json({
      message: 'Entries must be a valid JSON array.',
      errors: [{ field: 'entries', message: 'Entries must be a valid JSON array.' }],
    });
  }

  const normalizedEntries = entries.map(normalizeEmployment);
  const validationErrors = validateEmploymentCollection(normalizedEntries);
  if (validationErrors.length) {
    return res.status(422).json({
      message: 'Employment history validation failed.',
      errors: validationErrors,
    });
  }

  const replaceHistory = db.transaction(() => {
    db.prepare('DELETE FROM employment_history WHERE user_id = ?').run(req.user.id);

    const insertEmployment = db.prepare(`
      INSERT INTO employment_history (user_id, employer, job_title, start_date, end_date,
                                       industry_sector, location_country, location_city, is_current)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    normalizedEntries.forEach((entry) => {
      const isCurrent = !entry.endDate ? 1 : 0;
      insertEmployment.run(
        req.user.id,
        entry.employer,
        entry.jobTitle,
        entry.startDate,
        entry.endDate || null,
        entry.industrySector || null,
        entry.locationCountry || null,
        entry.locationCity || null,
        isCurrent,
      );
    });
  });

  replaceHistory();

  logger.info('Replaced employment history collection.', {
    userId: req.user.id,
    entryCount: normalizedEntries.length,
  });

  return res.json({
    message: 'Employment history updated successfully.',
    profile: getProfileByUserId(req.user.id),
  });
}

module.exports = {
  getMyProfile,
  replaceAchievementCollection,
  replaceCoreProfile,
  replaceEmploymentHistory,
  upload,
};
