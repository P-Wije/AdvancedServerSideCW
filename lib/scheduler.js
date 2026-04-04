const cron = require('node-cron');
const db = require('../db');
const { sendMail } = require('./mailer');
const { addDays, isoNow, toDateOnly } = require('./time');

function selectWinningBidForDate(targetDate) {
  const existingSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  if (existingSlot) {
    return existingSlot;
  }

  const winningBid = db.prepare(`
    SELECT *
    FROM bids
    WHERE target_date = ? AND status = 'active'
    ORDER BY amount DESC, updated_at ASC, id ASC
    LIMIT 1
  `).get(targetDate);

  if (!winningBid) {
    return null;
  }

  const saveWinner = db.transaction(() => {
    db.prepare(`
      INSERT INTO featured_slots (target_date, user_id, bid_id, bid_amount, status, selected_at)
      VALUES (?, ?, ?, ?, 'scheduled', ?)
    `).run(targetDate, winningBid.user_id, winningBid.id, winningBid.amount, isoNow());

    db.prepare(`
      UPDATE bids
      SET status = CASE WHEN id = ? THEN 'scheduled' ELSE 'lost' END,
          updated_at = ?
      WHERE target_date = ? AND status = 'active'
    `).run(winningBid.id, isoNow(), targetDate);
  });

  saveWinner();

  return db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
}

function activateFeaturedSlot(targetDate) {
  if (!db.prepare('SELECT id FROM featured_slots WHERE target_date = ?').get(targetDate)) {
    selectWinningBidForDate(targetDate);
  }

  const slot = db.prepare(`
    SELECT fs.*, u.email
    FROM featured_slots fs
    INNER JOIN users u ON u.id = fs.user_id
    WHERE fs.target_date = ?
  `).get(targetDate);

  if (!slot) {
    return null;
  }

  const activate = db.transaction(() => {
    db.prepare(`
      UPDATE featured_slots
      SET status = 'active',
          activated_at = COALESCE(activated_at, ?)
      WHERE id = ? AND status = 'scheduled'
    `).run(isoNow(), slot.id);

    db.prepare(`
      UPDATE featured_slots
      SET status = 'completed'
      WHERE status = 'active' AND target_date < ?
    `).run(targetDate);

    db.prepare(`
      UPDATE bids
      SET status = 'won',
          updated_at = ?
      WHERE id = ? AND status = 'scheduled'
    `).run(isoNow(), slot.bid_id);
  });

  activate();
  return db.prepare('SELECT * FROM featured_slots WHERE id = ?').get(slot.id);
}

async function notifyBidOutcome(targetDate) {
  const winnersAndLosers = db.prepare(`
    SELECT b.amount, b.status, u.email
    FROM bids b
    INNER JOIN users u ON u.id = b.user_id
    WHERE b.target_date = ? AND b.status IN ('scheduled', 'lost')
  `).all(targetDate);

  await Promise.all(winnersAndLosers.map((entry) => sendMail({
    to: entry.email,
    subject: entry.status === 'scheduled'
      ? 'You won tomorrow\'s Alumni of the Day bidding round'
      : 'Bidding update for tomorrow\'s Alumni of the Day slot',
    text: entry.status === 'scheduled'
      ? `Congratulations. Your blind bid of GBP ${entry.amount.toFixed(2)} won the featured slot for ${targetDate}.`
      : `Your bid for ${targetDate} was not the highest. You can review your status in the dashboard.`,
  })));
}

function startScheduler() {
  // 6:00 PM daily: decide tomorrow's winner without exposing the winning amount publicly.
  cron.schedule('0 18 * * *', async () => {
    const targetDate = toDateOnly(addDays(new Date(), 1));
    const result = selectWinningBidForDate(targetDate);
    if (result) {
      await notifyBidOutcome(targetDate);
    }
  });

  // Midnight daily: activate the previously selected winner.
  cron.schedule('0 0 * * *', () => {
    const targetDate = toDateOnly(new Date());
    activateFeaturedSlot(targetDate);
  });
}

module.exports = {
  activateFeaturedSlot,
  selectWinningBidForDate,
  startScheduler,
};
