const db = require('../db');
const { getBidForUserAndDate, getBidsForUser, getHighestActiveBid, getMonthlyWinCount, hasMonthlyEventBonus } = require('../lib/repositories');
const { addDays, monthBounds, monthKey, toDateOnly } = require('../lib/time');

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
  return {
    month: monthKey(target),
    wins,
    maxWins: hasBonus ? 4 : 3,
    remaining: Math.max((hasBonus ? 4 : 3) - wins, 0),
    hasBonus,
  };
}

function overview(req, res) {
  const targetDate = currentTargetDate();
  const allowance = getMonthlyAllowance(req.user.id, targetDate);
  const myBid = getBidForUserAndDate(req.user.id, targetDate);
  const selectedSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  const highestBid = selectedSlot
    ? db.prepare('SELECT * FROM bids WHERE id = ?').get(selectedSlot.bid_id)
    : getHighestActiveBid(targetDate);

  const tomorrowHistory = getBidsForUser(req.user.id, 10);

  return res.json({
    targetDate,
    biddingOpen: !biddingClosesAtSixPm() && !selectedSlot,
    blindStatus: {
      hasBid: Boolean(myBid),
      isWinning: Boolean(myBid && highestBid && myBid.id === highestBid.id),
      currentBidAmount: myBid ? myBid.amount : null,
      status: myBid ? myBid.status : 'none',
      feedback: myBid
        ? (highestBid && myBid.id === highestBid.id ? 'winning' : 'not-winning')
        : 'no-active-bid',
    },
    monthlyAllowance: allowance,
    history: tomorrowHistory,
  });
}

function placeBid(req, res) {
  const targetDate = currentTargetDate();
  if (biddingClosesAtSixPm() || db.prepare('SELECT id FROM featured_slots WHERE target_date = ?').get(targetDate)) {
    return res.status(400).json({ message: 'Bidding for tomorrow is closed after 6:00 PM.' });
  }

  const amount = Number(req.body.amount);
  const allowance = getMonthlyAllowance(req.user.id, targetDate);
  if (allowance.remaining <= 0) {
    return res.status(400).json({ message: 'Monthly featured-slot limit reached for that month.' });
  }

  const existingBid = getBidForUserAndDate(req.user.id, targetDate);
  if (existingBid && existingBid.status !== 'active') {
    return res.status(409).json({ message: 'This bid can no longer be updated.' });
  }

  if (existingBid) {
    if (amount <= Number(existingBid.amount)) {
      return res.status(400).json({ message: 'Bid updates must increase the current amount.' });
    }

    db.prepare(`
      UPDATE bids
      SET amount = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, existingBid.id);
  } else {
    db.prepare(`
      INSERT INTO bids (user_id, target_date, amount, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(req.user.id, targetDate, amount);
  }

  return res.status(existingBid ? 200 : 201).json({
    message: existingBid ? 'Bid increased successfully.' : 'Bid placed successfully.',
    overview: {
      targetDate,
      ...overviewPayload(req.user.id, targetDate),
    },
  });
}

function overviewPayload(userId, targetDate) {
  const allowance = getMonthlyAllowance(userId, targetDate);
  const myBid = getBidForUserAndDate(userId, targetDate);
  const selectedSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  const highestBid = selectedSlot
    ? db.prepare('SELECT * FROM bids WHERE id = ?').get(selectedSlot.bid_id)
    : getHighestActiveBid(targetDate);

  return {
    biddingOpen: !biddingClosesAtSixPm() && !selectedSlot,
    blindStatus: {
      hasBid: Boolean(myBid),
      isWinning: Boolean(myBid && highestBid && myBid.id === highestBid.id),
      currentBidAmount: myBid ? myBid.amount : null,
      status: myBid ? myBid.status : 'none',
      feedback: myBid
        ? (highestBid && myBid.id === highestBid.id ? 'winning' : 'not-winning')
        : 'no-active-bid',
    },
    monthlyAllowance: allowance,
    history: getBidsForUser(userId, 10),
  };
}

function cancelBid(req, res) {
  const bidId = Number(req.params.id);
  const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND user_id = ?').get(bidId, req.user.id);
  if (!bid) {
    return res.status(404).json({ message: 'Bid not found.' });
  }

  if (bid.status !== 'active') {
    return res.status(409).json({ message: 'Only active bids can be cancelled.' });
  }

  if (bid.target_date !== currentTargetDate() || biddingClosesAtSixPm()) {
    return res.status(400).json({ message: 'Bids can only be cancelled before the daily 6:00 PM cut-off.' });
  }

  db.prepare(`
    UPDATE bids
    SET status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(bidId);

  return res.json({ message: 'Bid cancelled successfully.' });
}

function history(req, res) {
  return res.json({
    bids: getBidsForUser(req.user.id, 50),
  });
}

function registerEventParticipation(req, res) {
  const month = monthKey(new Date(`${req.body.participatedOn}T00:00:00Z`));
  db.prepare(`
    INSERT INTO alumni_event_participation (user_id, event_name, participated_on, grants_extra_slot_month)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, grants_extra_slot_month) DO UPDATE SET
      event_name = excluded.event_name,
      participated_on = excluded.participated_on
  `).run(req.user.id, req.body.eventName, req.body.participatedOn, month);

  return res.status(201).json({
    message: 'Event participation recorded. This unlocks a fourth featured-slot opportunity for that month.',
  });
}

module.exports = {
  cancelBid,
  history,
  overview,
  placeBid,
  registerEventParticipation,
};
