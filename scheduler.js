const cron = require('node-cron');
const Bid = require('./models/Bid');
const Featured = require('./models/Featured');
const User = require('./models/User');

// Run at midnight every day
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Running daily winner selection...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if winner already selected for today
    const existingWinner = await Featured.findOne({ date: today });
    if (existingWinner) {
      console.log('Winner already selected for today');
      return;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get highest bid from yesterday's bidding
    const highestBid = await Bid.findOne({
      bidDate: { $gte: yesterday, $lt: today },
      status: 'active'
    }).sort({ amount: -1 });

    if (!highestBid) {
      console.log('No bids found for yesterday');
      return;
    }

    // Create featured entry
    const featured = new Featured({
      date: today,
      winner: highestBid.user,
      bidAmount: highestBid.amount
    });
    await featured.save();

    // Update bid status
    highestBid.status = 'won';
    await highestBid.save();

    // Update user's monthly wins
    const user = await User.findById(highestBid.user);
    user.monthlyWins += 1;

    // Reset monthly wins if new month
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    if (user.lastWinReset.getMonth() + 1 !== currentMonth || user.lastWinReset.getFullYear() !== currentYear) {
      user.monthlyWins = 1;
      user.lastWinReset = today;
      user.eventParticipation = false; // Reset event participation
    }
    await user.save();

    // Mark other active bids as lost
    await Bid.updateMany(
      {
        bidDate: { $gte: yesterday, $lt: today },
        status: 'active',
        user: { $ne: highestBid.user }
      },
      { status: 'lost' }
    );

    console.log(`Winner selected: ${highestBid.user} with bid £${highestBid.amount}`);
  } catch (error) {
    console.error('Error in winner selection:', error);
  }
});

module.exports = cron;
