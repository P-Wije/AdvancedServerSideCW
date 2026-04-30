const db = require('../db');

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByVerificationTokenHash(hash) {
  return db.prepare(`
    SELECT *
    FROM users
    WHERE verification_token_hash = ?
      AND verification_token_expires_at IS NOT NULL
      AND verification_token_expires_at > CURRENT_TIMESTAMP
  `).get(hash);
}

function getUserByResetTokenHash(hash) {
  return db.prepare(`
    SELECT *
    FROM users
    WHERE reset_token_hash = ?
      AND reset_token_expires_at IS NOT NULL
      AND reset_token_expires_at > CURRENT_TIMESTAMP
  `).get(hash);
}

function getProfileByUserId(userId) {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) {
    return null;
  }

  const achievements = db.prepare(`
    SELECT id, achievement_type AS achievementType, title, reference_url AS referenceUrl, completion_date AS completionDate
    FROM achievements
    WHERE user_id = ?
    ORDER BY completion_date DESC, id DESC
  `).all(userId);

  const employmentHistory = db.prepare(`
    SELECT id, employer, job_title AS jobTitle, start_date AS startDate, end_date AS endDate,
           industry_sector AS industrySector, location_country AS locationCountry,
           location_city AS locationCity, is_current AS isCurrent
    FROM employment_history
    WHERE user_id = ?
    ORDER BY start_date DESC, id DESC
  `).all(userId);

  return {
    userId: profile.user_id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    biography: profile.biography,
    linkedinUrl: profile.linkedin_url,
    profileImagePath: profile.profile_image_path,
    programme: profile.programme,
    graduationDate: profile.graduation_date,
    directoryVisible: profile.directory_visible !== 0,
    degrees: achievements.filter((item) => item.achievementType === 'degree'),
    certifications: achievements.filter((item) => item.achievementType === 'certification'),
    licences: achievements.filter((item) => item.achievementType === 'licence'),
    courses: achievements.filter((item) => item.achievementType === 'course'),
    employmentHistory,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function getFullProfileForFeatured(userId) {
  const user = getUserById(userId);
  const profile = getProfileByUserId(userId);
  if (!user || !profile) {
    return null;
  }

  return {
    email: user.email,
    profile,
  };
}

function getMonthlyWinCount(userId, monthStart, monthEnd) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM featured_slots
    WHERE user_id = ?
      AND target_date >= ?
      AND target_date < ?
  `).get(userId, monthStart, monthEnd);
  return row?.total || 0;
}

function hasMonthlyEventBonus(userId, month) {
  const row = db.prepare(`
    SELECT id
    FROM alumni_event_participation
    WHERE user_id = ?
      AND grants_extra_slot_month = ?
  `).get(userId, month);
  return Boolean(row);
}

function getBidForUserAndDate(userId, targetDate) {
  return db.prepare(`
    SELECT *
    FROM bids
    WHERE user_id = ? AND target_date = ?
  `).get(userId, targetDate);
}

function getHighestActiveBid(targetDate) {
  return db.prepare(`
    SELECT b.*, u.email
    FROM bids b
    INNER JOIN users u ON u.id = b.user_id
    WHERE b.target_date = ? AND b.status = 'active'
    ORDER BY b.amount DESC, b.updated_at ASC, b.id ASC
    LIMIT 1
  `).get(targetDate);
}

function getBidsForUser(userId, limit = 20) {
  return db.prepare(`
    SELECT id, target_date AS targetDate, amount, status, created_at AS createdAt, updated_at AS updatedAt
    FROM bids
    WHERE user_id = ?
    ORDER BY target_date DESC, updated_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function getApiTokensForUser(userId) {
  return db.prepare(`
    SELECT
      t.id,
      t.name,
      t.token_prefix AS tokenPrefix,
      t.scopes,
      t.created_at AS createdAt,
      t.last_used_at AS lastUsedAt,
      t.revoked_at AS revokedAt,
      COUNT(u.id) AS usageCount
    FROM api_tokens t
    LEFT JOIN api_token_usage u ON u.api_token_id = t.id
    WHERE t.created_by_user_id = ?
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).all(userId);
}

function getApiTokenUsage(apiTokenId, limit = 50) {
  return db.prepare(`
    SELECT endpoint, http_method AS httpMethod, ip_address AS ipAddress, user_agent AS userAgent, response_status AS responseStatus, created_at AS createdAt
    FROM api_token_usage
    WHERE api_token_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(apiTokenId, limit);
}

/**
 * Returns presets a user has saved on the alumni-directory filter form.
 *
 * @param {number} userId Owning user id.
 */
function getFilterPresetsForUser(userId) {
  return db.prepare(`
    SELECT id, name, filters_json AS filtersJson, created_at AS createdAt
    FROM analytics_filter_presets
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}

module.exports = {
  getApiTokenUsage,
  getApiTokensForUser,
  getBidForUserAndDate,
  getBidsForUser,
  getFilterPresetsForUser,
  getFullProfileForFeatured,
  getHighestActiveBid,
  getMonthlyWinCount,
  getProfileByUserId,
  getUserByEmail,
  getUserById,
  getUserByResetTokenHash,
  getUserByVerificationTokenHash,
  hasMonthlyEventBonus,
};
