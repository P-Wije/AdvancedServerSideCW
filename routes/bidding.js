const express = require('express');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Featured = require('../models/Featured');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

// GET bidding page
router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get user's bids for current month
    const userBids = await Bid.find({
      user: req.session.userId,
      month: currentMonth,
      year: currentYear
    }).sort({ bidDate: -1 });

    // Get highest bid (blind bidding - don't show amount)
    const highestBid = await Bid.findOne({
      month: currentMonth,
      year: currentYear
    }).sort({ amount: -1 });

    const hasActiveBid = userBids.some(bid => bid.status === 'active');
    const isWinning = highestBid && highestBid.user.toString() === req.session.userId;

    // Check monthly limit
    const monthlyWins = await Featured.countDocuments({
      winner: req.session.userId,
      date: {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lt: new Date(currentYear, currentMonth, 1)
      }
    });

    const maxWins = user.eventParticipation ? 4 : 3;
    const remainingSlots = maxWins - monthlyWins;

    res.render('bidding', {
      userBids,
      hasActiveBid,
      isWinning,
      remainingSlots,
      monthlyWins,
      maxWins
    });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error', error: {} });
  }
});

// POST place/update bid
router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { amount } = req.body;
    const bidAmount = parseFloat(amount);

    if (isNaN(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ message: 'Invalid bid amount' });
    }

    const user = await User.findById(req.session.userId);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Check monthly limit
    const monthlyWins = await Featured.countDocuments({
      winner: req.session.userId,
      date: {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lt: new Date(currentYear, currentMonth, 1)
      }
    });

    const maxWins = user.eventParticipation ? 4 : 3;
    if (monthlyWins >= maxWins) {
      return res.status(400).json({ message: 'Monthly bidding limit reached' });
    }

    // Get user's active bid
    let existingBid = await Bid.findOne({
      user: req.session.userId,
      month: currentMonth,
      year: currentYear,
      status: 'active'
    });

    if (existingBid) {
      // Update bid - can only increase
      if (bidAmount <= existingBid.amount) {
        return res.status(400).json({ message: 'Bid must be higher than current bid' });
      }
      existingBid.amount = bidAmount;
      existingBid.bidDate = now;
      await existingBid.save();
    } else {
      // Create new bid
      const newBid = new Bid({
        user: req.session.userId,
        amount: bidAmount,
        month: currentMonth,
        year: currentYear
      });
      await newBid.save();
    }

    res.redirect('/bidding');
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// API endpoint for bid status (for AJAX updates)
router.get('/status', requireAuth, requireVerified, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const userBids = await Bid.find({
      user: req.session.userId,
      month: currentMonth,
      year: currentYear
    }).sort({ bidDate: -1 });

    const highestBid = await Bid.findOne({
      month: currentMonth,
      year: currentYear
    }).sort({ amount: -1 });

    const hasActiveBid = userBids.some(bid => bid.status === 'active');
    const isWinning = highestBid && highestBid.user.toString() === req.session.userId;

    res.json({
      hasActiveBid,
      isWinning,
      lastBid: userBids[0] ? userBids[0].amount : null,
      lastBidDate: userBids[0] ? userBids[0].bidDate : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
