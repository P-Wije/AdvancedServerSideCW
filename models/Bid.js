const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  bidDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'won', 'lost'],
    default: 'active'
  },
  month: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  }
});

// Index for efficient queries
bidSchema.index({ user: 1, month: 1, year: 1 });
bidSchema.index({ bidDate: -1 });

module.exports = mongoose.model('Bid', bidSchema);
