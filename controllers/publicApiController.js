const db = require('../db');
const logger = require('../lib/logger');
const { getFullProfileForFeatured } = require('../lib/repositories');
const { toDateOnly } = require('../lib/time');

/**
 * Returns today's featured alumnus for bearer-token clients such as the future AR app.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function getTodaysFeaturedAlumnus(req, res) {
  const today = toDateOnly(new Date());
  const slot = db.prepare(`
    SELECT *
    FROM featured_slots
    WHERE target_date = ? AND status IN ('active', 'completed')
    ORDER BY id DESC
    LIMIT 1
  `).get(today);

  if (!slot) {
    return res.status(404).json({ message: 'No featured alumnus is active for today.' });
  }

  const alumnus = getFullProfileForFeatured(slot.user_id);
  if (!alumnus) {
    return res.status(404).json({ message: 'Featured alumnus profile is incomplete.' });
  }

  logger.info('Served featured alumnus payload.', {
    featuredDate: today,
    userId: slot.user_id,
    apiTokenId: req.apiToken?.id || null,
  });

  return res.json({
    featuredDate: today,
    bidAmount: slot.bid_amount,
    alumnus,
  });
}

module.exports = {
  getTodaysFeaturedAlumnus,
};
