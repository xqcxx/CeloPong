const mongoose = require('mongoose');

// A weekly leaderboard reward for the player who topped a given ISO week.
//
// Status flow:
//   available  → computed winner, nothing requested yet
//   requested  → player asked for payout (admin should fund + approve)
//   approved   → admin approved the reward on-chain (player may withdraw)
//   claimed    → player withdrew the approved reward on-chain
const weeklyRewardSchema = new mongoose.Schema({
  weekKey: {
    type: String, // e.g. "2026-W29"
    required: true,
    index: true
  },
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  playerName: {
    type: String
  },
  wins: {
    type: Number,
    required: true,
    default: 0
  },
  gamesPlayed: {
    type: Number,
    required: true,
    default: 0
  },
  rank: {
    type: Number,
    default: 1
  },
  tokenSymbol: {
    type: String,
    default: 'cUSD'
  },
  tokenAddress: {
    type: String,
    lowercase: true
  },
  amount: {
    type: String, // reward amount in base units (wei) as a string
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'requested', 'approved', 'claimed'],
    default: 'available',
    index: true
  },
  requestedAt: {
    type: Date
  },
  approvedAt: {
    type: Date
  },
  approveTxHash: {
    type: String
  },
  claimedAt: {
    type: Date
  },
  claimTxHash: {
    type: String
  }
}, {
  timestamps: true
});

// One top-player reward record per completed week.
weeklyRewardSchema.index({ weekKey: 1 }, { unique: true });

const WeeklyReward = mongoose.model('WeeklyReward', weeklyRewardSchema);

module.exports = WeeklyReward;
