const db = require('../db');
const { getFullProfileForFeatured } = require('../lib/repositories');
const { toDateOnly } = require('../lib/time');

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

  return res.json({
    featuredDate: today,
    bidAmount: slot.bid_amount,
    alumnus,
  });
}

module.exports = {
  getTodaysFeaturedAlumnus,
};
