const { getProfileByUserId, getBidsForUser } = require('../../lib/repositories');
const analyticsRepo = require('../../lib/analyticsRepo');
const { readStandardFilters } = require('../../lib/analyticsFilters');

/**
 * Renders the role-aware dashboard.
 *
 * Alumni see profile-completion guidance plus a snapshot of their bidding
 * activity. University staff see the analytics overview, mirroring the hub
 * page so the dashboard doubles as the landing pad after sign-in.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 */
function showDashboard(req, res) {
  const role = req.user?.role || 'alumni';
  if (role === 'university_staff') {
    const filters = readStandardFilters(req.query);
    const summary = analyticsRepo.getSummary(filters);
    const filterOptions = analyticsRepo.getFilterOptions();
    return res.render('dashboard', {
      title: 'University analytics dashboard',
      role,
      filters,
      filterOptions,
      summary,
    });
  }

  const profile = getProfileByUserId(req.user.id);
  const bids = getBidsForUser(req.user.id, 5);
  const completionPercent = computeProfileCompletion(profile);

  return res.render('dashboard', {
    title: 'My alumni dashboard',
    role,
    profile,
    completionPercent,
    bids,
  });
}

/**
 * Estimates how complete an alumnus's profile is so the dashboard can nudge
 * them toward the missing sections that improve their bidding presentation.
 *
 * @param {object|null} profile Aggregated profile from `getProfileByUserId`.
 * @returns {number} Percentage between 0 and 100.
 */
function computeProfileCompletion(profile) {
  if (!profile) return 0;
  const fields = [
    Boolean(profile.firstName),
    Boolean(profile.lastName),
    Boolean(profile.biography && profile.biography.length >= 30),
    Boolean(profile.linkedinUrl),
    Boolean(profile.programme),
    Boolean(profile.graduationDate),
    Boolean(profile.profileImagePath),
    Array.isArray(profile.degrees) && profile.degrees.length > 0,
    Array.isArray(profile.certifications) && profile.certifications.length > 0,
    Array.isArray(profile.employmentHistory) && profile.employmentHistory.length > 0,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

module.exports = { showDashboard };
