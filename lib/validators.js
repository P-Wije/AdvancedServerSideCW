const { body, validationResult } = require('express-validator');
const config = require('./config');
const logger = require('./logger');
const { PASSWORD_POLICY, isStrongPassword } = require('./security');
const { ALL_SCOPES, CLIENT_PRESETS } = require('./scopes');

/**
 * Sanitizes free-text input by stripping HTML tags and trimming whitespace.
 *
 * @param {unknown} value Raw input value.
 * @returns {string} Sanitized text output.
 */
function sanitizeText(value) {
  return String(value || '')
    .replaceAll(/<[^>]*>/g, '')
    .trim();
}

/**
 * Translates express-validator failures into a uniform API payload.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function validationHandler(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  return res.status(422).json({
    message: 'Validation failed.',
    errors: result.array().map(({ path, msg }) => ({ field: path, message: msg })),
  });
}

const authValidators = {
  register: [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.')
      .custom((value) => value.toLowerCase().endsWith(`@${config.universityEmailDomain}`))
      .withMessage(`Use your @${config.universityEmailDomain} university email address.`),
    body('password')
      .isString()
      .custom((value) => isStrongPassword(value))
      .withMessage(PASSWORD_POLICY),
    body('role')
      .optional()
      .isIn(['alumni', 'university_staff'])
      .withMessage('Role must be either alumni or university_staff.'),
  ],
  login: [
    body('email').trim().isEmail().withMessage('Enter a valid email address.'),
    body('password').isString().notEmpty().withMessage('Password is required.'),
  ],
  forgotPassword: [
    body('email').trim().isEmail().withMessage('Enter a valid email address.'),
  ],
  resetPassword: [
    body('token').isString().notEmpty().withMessage('Reset token is required.'),
    body('password')
      .isString()
      .custom((value) => isStrongPassword(value))
      .withMessage(PASSWORD_POLICY),
  ],
  eventParticipation: [
    body('eventName').trim().isLength({ min: 3, max: 120 }).withMessage('Event name is required.'),
    body('participatedOn').isISO8601().withMessage('Provide a valid event date.'),
  ],
  apiKey: [
    body('name').trim().isLength({ min: 3, max: 80 }).withMessage('API key name is required.'),
    body('clientPreset')
      .optional({ values: 'falsy' })
      .isIn(Object.keys(CLIENT_PRESETS))
      .withMessage(`clientPreset must be one of: ${Object.keys(CLIENT_PRESETS).join(', ')}.`),
    body('scopes')
      .optional({ values: 'falsy' })
      .custom((value) => {
        const list = Array.isArray(value)
          ? value
          : (typeof value === 'string' ? value.split(/[\s,]+/).filter(Boolean) : []);
        return list.every((scope) => ALL_SCOPES.includes(scope));
      })
      .withMessage(`Scopes must be drawn from: ${ALL_SCOPES.join(', ')}.`),
  ],
  bid: [
    body('amount').isFloat({ gt: 0 }).withMessage('Bid amount must be greater than zero.'),
  ],
};

/**
 * Parses a dashboard field into an array for client-side rendering helpers.
 *
 * @param {unknown} value Raw field value.
 * @returns {Array<unknown>} Parsed array or empty array when absent/invalid.
 */
function parseArrayField(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.warn('Failed to parse repeatable JSON field.', { error: error.message });
      return [];
    }
  }

  return [];
}

/**
 * Normalizes the combined dashboard profile payload into server-friendly shapes.
 *
 * @param {Record<string, unknown>} body Request body payload.
 * @returns {{firstName: string, lastName: string, biography: string, linkedinUrl: string, degrees: Array<object>, certifications: Array<object>, licences: Array<object>, courses: Array<object>, employmentHistory: Array<object>}} Normalized profile payload.
 */
function normalizeProfilePayload(body) {
  return {
    firstName: sanitizeText(body.firstName),
    lastName: sanitizeText(body.lastName),
    biography: sanitizeText(body.biography),
    linkedinUrl: String(body.linkedinUrl || '').trim(),
    degrees: parseArrayField(body.degrees).map(normalizeAchievement),
    certifications: parseArrayField(body.certifications).map(normalizeAchievement),
    licences: parseArrayField(body.licences).map(normalizeAchievement),
    courses: parseArrayField(body.courses).map(normalizeAchievement),
    employmentHistory: parseArrayField(body.employmentHistory).map(normalizeEmployment),
  };
}

/**
 * Normalizes a single achievement-like entry.
 *
 * @param {Record<string, unknown>} item Raw achievement payload.
 * @returns {{title: string, referenceUrl: string, completionDate: string}} Normalized achievement.
 */
function normalizeAchievement(item) {
  return {
    title: sanitizeText(item?.title),
    referenceUrl: String(item?.referenceUrl || item?.url || '').trim(),
    completionDate: String(item?.completionDate || '').trim(),
  };
}

/**
 * Normalizes a single employment history entry.
 *
 * @param {Record<string, unknown>} item Raw employment payload.
 * @returns {{employer: string, jobTitle: string, startDate: string, endDate: string}} Normalized employment record.
 */
function normalizeEmployment(item) {
  return {
    employer: sanitizeText(item?.employer || item?.company),
    jobTitle: sanitizeText(item?.jobTitle || item?.position),
    startDate: String(item?.startDate || '').trim(),
    endDate: String(item?.endDate || '').trim(),
    industrySector: sanitizeText(item?.industrySector || item?.sector),
    locationCountry: sanitizeText(item?.locationCountry || item?.country),
    locationCity: sanitizeText(item?.locationCity || item?.city),
  };
}

/**
 * Validates the aggregate profile payload used by the legacy combined form helper.
 *
 * @param {ReturnType<typeof normalizeProfilePayload>} profile Normalized profile payload.
 * @returns {Array<{field: string, message: string}>} Validation error list.
 */
function validateProfilePayload(profile) {
  const errors = [];
  const pushError = (field, message) => errors.push({ field, message });
  const isUrl = (value) => {
    if (!URL.canParse(value)) {
      return false;
    }

    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  };

  if (!profile.firstName || profile.firstName.length > 80) {
    pushError('firstName', 'First name is required and must be under 80 characters.');
  }
  if (!profile.lastName || profile.lastName.length > 80) {
    pushError('lastName', 'Last name is required and must be under 80 characters.');
  }
  if (!profile.biography || profile.biography.length < 30 || profile.biography.length > 1200) {
    pushError('biography', 'Biography must be between 30 and 1200 characters.');
  }
  if (!isUrl(profile.linkedinUrl) || !profile.linkedinUrl.includes('linkedin.com')) {
    pushError('linkedinUrl', 'Provide a valid LinkedIn profile URL.');
  }

  ['degrees', 'certifications', 'licences', 'courses'].forEach((field) => {
    profile[field].forEach((item, index) => {
      if (!item.title) {
        pushError(`${field}[${index}].title`, 'Title is required.');
      }
      if (!isUrl(item.referenceUrl)) {
        pushError(`${field}[${index}].referenceUrl`, 'A valid URL is required.');
      }
      if (!item.completionDate || Number.isNaN(Date.parse(item.completionDate))) {
        pushError(`${field}[${index}].completionDate`, 'A valid completion date is required.');
      }
    });
  });

  profile.employmentHistory.forEach((item, index) => {
    if (!item.employer) {
      pushError(`employmentHistory[${index}].employer`, 'Employer is required.');
    }
    if (!item.jobTitle) {
      pushError(`employmentHistory[${index}].jobTitle`, 'Job title is required.');
    }
    if (!item.startDate || Number.isNaN(Date.parse(item.startDate))) {
      pushError(`employmentHistory[${index}].startDate`, 'A valid start date is required.');
    }
    if (item.endDate && Number.isNaN(Date.parse(item.endDate))) {
      pushError(`employmentHistory[${index}].endDate`, 'End date must be a valid date.');
    }
    if (item.endDate && item.startDate && new Date(item.endDate) < new Date(item.startDate)) {
      pushError(`employmentHistory[${index}].endDate`, 'End date cannot be earlier than start date.');
    }
  });

  return errors;
}

module.exports = {
  authValidators,
  normalizeProfilePayload,
  normalizeAchievement,
  normalizeEmployment,
  sanitizeText,
  validateProfilePayload,
  validationHandler,
};
