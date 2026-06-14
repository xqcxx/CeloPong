const mongoose = require('mongoose');

const walletSessionSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  challenge: {
    type: String,
    default: null
  },
  challengeExpiresAt: {
    type: Date,
    default: null
  },
  tokenHash: {
    type: String,
    default: null,
    index: true
  },
  tokenExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

walletSessionSchema.index({ tokenExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('WalletSession', walletSessionSchema);
