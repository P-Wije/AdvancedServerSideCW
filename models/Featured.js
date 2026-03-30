const mongoose = require('mongoose');

const featuredSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bidAmount: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index on date for quick lookups
featuredSchema.index({ date: 1 });

module.exports = mongoose.model('Featured', featuredSchema);
