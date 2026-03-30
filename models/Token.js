const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  endpoint: String,
  method: String,
  ip: String
});

const tokenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  revoked: {
    type: Boolean,
    default: false
  },
  usageLogs: [usageLogSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: Date
});

// Index for token lookup
tokenSchema.index({ token: 1 });

module.exports = mongoose.model('Token', tokenSchema);
