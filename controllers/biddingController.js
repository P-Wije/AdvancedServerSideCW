const db = require('../db');
const logger = require('../lib/logger');
const { getBidForUserAndDate, getBidsForUser, getHighestActiveBid, getMonthlyWinCount, hasMonthlyEventBonus } = require('../lib/repositories');
const { addDays, monthBounds, monthKey, toDateOnly } = require('../lib/time');

/**
 * Returns the ISO date for tomorrow's featured bidding slot.
 *
 * @returns {string} YYYY-MM-DD date string for the next bidding target.
 */
function currentTargetDate() {
  return toDateOnly(addDays(new Date(), 1));
}

/**
 * Indicates whether today's blind bidding round has closed.
 *
 * @returns {boolean} True once local time is 6 PM or later.
 */
function biddingClosesAtSixPm() {
  const now = new Date();
  return now.getHours() >= 18;
}

/**
 * Calculates the monthly appearance allowance for a given user and target month.
 *
 * @param {number} userId Alumni user id.
 * @param {string} targetDate Target featured date in YYYY-MM-DD format.
 * @returns {{month: string, wins: number, maxWins: number, remaining: number, hasBonus: boolean}} Monthly allowance summary.
 */
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

/**
 * Resolves the current winning bid for a target date from scheduled or active records.
 *
 * @param {string} targetDate Target featured date in YYYY-MM-DD format.
 * @param {Record<string, unknown>|undefined} selectedSlot Existing scheduled slot, if any.
 * @returns {Record<string, unknown>|undefined} Winning bid row when found.
 */
function getHighestBidForTargetDate(targetDate, selectedSlot) {
  if (selectedSlot) {
    return db.prepare('SELECT * FROM bids WHERE id = ?').get(selectedSlot.bid_id);
  }

  return getHighestActiveBid(targetDate);
}

/**
 * Converts bid state into a blind feedback label for the dashboard.
 *
 * @param {Record<string, unknown>|undefined} myBid Signed-in user's bid row.
 * @param {Record<string, unknown>|undefined} highestBid Winning bid row for the target date.
 * @returns {'winning'|'not-winning'|'no-active-bid'} Blind bidding feedback.
 */
function getBidFeedback(myBid, highestBid) {
  if (!myBid) {
    return 'no-active-bid';
  }

  if (highestBid && myBid.id === highestBid.id) {
    return 'winning';
  }

  return 'not-winning';
}

/**
 * Builds the blind bid summary returned to the client.
 *
 * @param {Record<string, unknown>|undefined} myBid Signed-in user's bid row.
 * @param {Record<string, unknown>|undefined} highestBid Winning bid row for the target date.
 * @returns {{hasBid: boolean, isWinning: boolean, currentBidAmount: number|null, status: string, feedback: string}} Blind bid status payload.
 */
function buildBlindStatus(myBid, highestBid) {
  return {
    hasBid: Boolean(myBid),
    isWinning: Boolean(myBid && highestBid && myBid.id === highestBid.id),
    currentBidAmount: myBid ? myBid.amount : null,
    status: myBid ? myBid.status : 'none',
    feedback: getBidFeedback(myBid, highestBid),
  };
}

/**
 * Returns the bidding dashboard overview for the signed-in alumnus.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function overview(req, res) {
  const targetDate = currentTargetDate();
  const allowance = getMonthlyAllowance(req.user.id, targetDate);
  const myBid = getBidForUserAndDate(req.user.id, targetDate);
  const selectedSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  const highestBid = getHighestBidForTargetDate(targetDate, selectedSlot);

  const tomorrowHistory = getBidsForUser(req.user.id, 10);

  return res.json({
    targetDate,
    biddingOpen: !biddingClosesAtSixPm() && !selectedSlot,
    blindStatus: buildBlindStatus(myBid, highestBid),
    monthlyAllowance: allowance,
    history: tomorrowHistory,
  });
}

/**
 * Places a new blind bid or increases the user's current bid for tomorrow's slot.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
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

  logger.info('Saved blind bid.', {
    userId: req.user.id,
    targetDate,
    amount,
    updatedExistingBid: Boolean(existingBid),
  });

  const responseStatus = existingBid ? 200 : 201;
  const responseMessage = existingBid ? 'Bid increased successfully.' : 'Bid placed successfully.';

  return res.status(responseStatus).json({
    message: responseMessage,
    overview: {
      targetDate,
      ...overviewPayload(req.user.id, targetDate),
    },
  });
}

/**
 * Builds the summary payload reused after bid mutations.
 *
 * @param {number} userId Alumni user id.
 * @param {string} targetDate Target featured date in YYYY-MM-DD format.
 * @returns {{biddingOpen: boolean, blindStatus: object, monthlyAllowance: object, history: Array<object>}} Overview payload.
 */
function overviewPayload(userId, targetDate) {
  const allowance = getMonthlyAllowance(userId, targetDate);
  const myBid = getBidForUserAndDate(userId, targetDate);
  const selectedSlot = db.prepare('SELECT * FROM featured_slots WHERE target_date = ?').get(targetDate);
  const highestBid = getHighestBidForTargetDate(targetDate, selectedSlot);

  return {
    biddingOpen: !biddingClosesAtSixPm() && !selectedSlot,
    blindStatus: buildBlindStatus(myBid, highestBid),
    monthlyAllowance: allowance,
    history: getBidsForUser(userId, 10),
  };
}

/**
 * Cancels an active bid before the daily cut-off.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
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

  logger.info('Cancelled blind bid.', {
    userId: req.user.id,
    bidId,
  });

  return res.json({ message: 'Bid cancelled successfully.' });
}

/**
 * Returns a longer bid history for the signed-in alumnus.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function history(req, res) {
  return res.json({
    bids: getBidsForUser(req.user.id, 50),
  });
}

/**
 * Records alumni event participation to unlock an extra monthly featured-slot allowance.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @returns {void}
 */
function registerEventParticipation(req, res) {
  const month = monthKey(new Date(`${req.body.participatedOn}T00:00:00Z`));
  db.prepare(`
    INSERT INTO alumni_event_participation (user_id, event_name, participated_on, grants_extra_slot_month)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, grants_extra_slot_month) DO UPDATE SET
      event_name = excluded.event_name,
      participated_on = excluded.participated_on
  `).run(req.user.id, req.body.eventName, req.body.participatedOn, month);

  logger.info('Recorded alumni event participation bonus.', {
    userId: req.user.id,
    eventName: req.body.eventName,
    month,
  });

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
