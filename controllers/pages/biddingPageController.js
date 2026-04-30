const db = require('../../db');
const logger = require('../../lib/logger');
const { setFlash } = require('../../lib/flash');
const { getBidForUserAndDate, getBidsForUser, getHighestActiveBid, getMonthlyWinCount, hasMonthlyEventBonus } = require('../../lib/repositories');
const { addDays, monthBounds, monthKey, toDateOnly } = require('../../lib/time');

function currentTargetDate() {
  return toDateOnly(addDays(new Date(), 1));
}

function biddingClosesAtSixPm() {
  const now = new Date();
  return now.getHours() >= 18;
}

function getMonthlyAllowance(userId, targetDate) {
  const target = new Date(`${targetDate}T00:00:00Z`);
  const bounds = monthBounds(target);
  const wins = getMonthlyWinCount(userId, bounds.start, bounds.end);
  const hasBonus = hasMonthlyEventBonus(userId, monthKey(target));
  const maxWins = hasBonus ? 4 : 3;
  return {
    month: monthKey(target),
    wins,
    maxWins,
    remaining: Math.max(maxWins - wins, 0),
    hasBonus,
  };
}

const showBidding = (req, res) => {
  const targetDate = currentTargetDate();
  const allowance = getMonthlyAllowance(req.user.id, targetDate);
  const myBid = getBidForUserAndDate(req.user.id, targetDate);
  const selectedSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  const highestBid = selectedSlot
    ? db.prepare('SELECT * FROM bids WHERE id = ?').get(selectedSlot.bid_id)
    : getHighestActiveBid(targetDate);
  const history = getBidsForUser(req.user.id, 25);

  // Blind status: never expose other users' bid amounts.
  const blindStatus = {
    hasBid: Boolean(myBid),
    isWinning: Boolean(myBid && highestBid && myBid.id === highestBid.id),
    currentBidAmount: myBid ? myBid.amount : null,
    status: myBid ? myBid.status : 'none',
    feedback: !myBid ? 'no-active-bid' : (highestBid && myBid.id === highestBid.id ? 'winning' : 'not-winning'),
  };

  res.render('bidding', {
    title: 'Blind bidding',
    targetDate,
    biddingOpen: !biddingClosesAtSixPm() && !selectedSlot,
    blindStatus,
    monthlyAllowance: allowance,
    history,
  });
};

const submitBid = (req, res) => {
  const targetDate = currentTargetDate();
  if (biddingClosesAtSixPm() || db.prepare('SELECT id FROM featured_slots WHERE target_date = ?').get(targetDate)) {
    setFlash(req, 'error', 'Bidding for tomorrow is closed after 6:00 PM.');
    return res.redirect('/bidding');
  }
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    setFlash(req, 'error', 'Bid amount must be a positive number.');
    return res.redirect('/bidding');
  }
  const allowance = getMonthlyAllowance(req.user.id, targetDate);
  if (allowance.remaining <= 0) {
    setFlash(req, 'error', 'Monthly featured-slot limit reached.');
    return res.redirect('/bidding');
  }

  const existingBid = getBidForUserAndDate(req.user.id, targetDate);
  if (existingBid && existingBid.status !== 'active') {
    setFlash(req, 'error', 'This bid can no longer be updated.');
    return res.redirect('/bidding');
  }
  if (existingBid && amount <= Number(existingBid.amount)) {
    setFlash(req, 'error', 'Bid updates must increase the current amount.');
    return res.redirect('/bidding');
  }

  if (existingBid) {
    db.prepare(`UPDATE bids SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(amount, existingBid.id);
    setFlash(req, 'success', 'Bid increased successfully.');
  } else {
    db.prepare(`INSERT INTO bids (user_id, target_date, amount, status, created_at, updated_at)
                VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(req.user.id, targetDate, amount);
    setFlash(req, 'success', 'Bid placed.');
  }
  logger.info('Bid saved via SSR.', { userId: req.user.id, targetDate, amount });
  return res.redirect('/bidding');
};

const cancelBid = (req, res) => {
  const bidId = Number(req.params.id);
  const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND user_id = ?').get(bidId, req.user.id);
  if (!bid) {
    setFlash(req, 'error', 'Bid not found.');
    return res.redirect('/bidding');
  }
  if (bid.status !== 'active' || bid.target_date !== currentTargetDate() || biddingClosesAtSixPm()) {
    setFlash(req, 'error', 'Only active, pre-cutoff bids can be cancelled.');
    return res.redirect('/bidding');
  }
  db.prepare(`UPDATE bids SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id = ?`).run(bidId);
  setFlash(req, 'success', 'Bid cancelled.');
  return res.redirect('/bidding');
};

const submitEventParticipation = (req, res) => {
  const eventName = String(req.body.eventName || '').trim();
  const participatedOn = String(req.body.participatedOn || '').trim();
  if (!eventName || !participatedOn || Number.isNaN(Date.parse(participatedOn))) {
    setFlash(req, 'error', 'Provide a valid event name and date.');
    return res.redirect('/bidding');
  }
  const month = monthKey(new Date(`${participatedOn}T00:00:00Z`));
  db.prepare(`
    INSERT INTO alumni_event_participation (user_id, event_name, participated_on, grants_extra_slot_month)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, grants_extra_slot_month) DO UPDATE SET
      event_name = excluded.event_name,
      participated_on = excluded.participated_on
  `).run(req.user.id, eventName, participatedOn, month);
  setFlash(req, 'success', 'Event participation recorded. Bonus slot unlocked for that month.');
  return res.redirect('/bidding');
};

module.exports = {
  cancelBid,
  showBidding,
  submitBid,
  submitEventParticipation,
};
