const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  player1: {
    name: { type: String, required: true },
    rating: { type: Number, required: true }
  },
  player2: {
    name: { type: String },
    rating: { type: Number }
  },
  winner: {
    type: String, // 'player1' or 'player2'
    enum: ['player1', 'player2', null],
    default: null
  },
  score: {
    player1: { type: Number, default: 0 },
    player2: { type: Number, default: 0 }
  },

  // Staking fields
  isStaked: {
    type: Boolean,
    default: false,
    index: true
  },
  stakeAmount: {
    type: String, // ETH amount as string (e.g., "0.01")
    default: null
  },
  stakeCurrency: {
    type: String, // 'CELO', 'cUSD', 'USDC', 'USDT'
    default: 'CELO'
  },
  player1Address: {
    type: String, // Ethereum address
    lowercase: true,
    index: true
  },
  player2Address: {
    type: String, // Ethereum address
    lowercase: true,
    index: true
  },
  player1TxHash: {
    type: String // Player 1's stake transaction hash
  },
  player2TxHash: {
    type: String // Player 2's stake transaction hash
  },
  winnerAddress: {
    type: String, // Winner's Ethereum address
    lowercase: true
  },
  winnerSignature: {
    type: String // Legacy backend-signed proof of win
  },
  resultSignature: {
    type: String // Backend-signed authoritative final result
  },
  escrowAddress: {
    type: String,
    lowercase: true
  },
  chainId: {
    type: Number
  },
  claimed: {
    type: Boolean,
    default: false,
    index: true
  },
  claimTxHash: {
    type: String // Prize claim transaction hash
  },
  claimedAt: {
    type: Date
  },
  abandonmentSignature: {
    type: String
  },

  // Challenge board fields
  challengeCreated: {
    type: Boolean,
    default: false
  },
  challengeAccepted: {
    type: Boolean,
    default: false
  },
  challengeAcceptor: {
    type: String,
    lowercase: true
  },

  // Game status and timestamps
  status: {
    type: String,
    enum: ['waiting', 'playing', 'paused', 'finished', 'cancelled', 'abandoned', 'refunded'],
    default: 'waiting'
  },
  lifecyclePhase: {
    type: String,
    enum: [
      'waiting_for_player2',
      'waiting_for_player1_return',
      'ready',
      'playing',
      'paused_reconnect',
      'finished',
      'abandoned',
      'refunded'
    ],
    default: 'waiting_for_player2',
    index: true
  },
  resultReason: {
    type: String,
    enum: ['score', 'forfeit', 'disconnect_timeout', 'abandoned', null],
    default: null
  },
  joinDeadline: Date,
  player1Connected: { type: Boolean, default: false },
  player2Connected: { type: Boolean, default: false },
  player1ReconnectRemainingMs: { type: Number, default: 5 * 60 * 1000 },
  player2ReconnectRemainingMs: { type: Number, default: 5 * 60 * 1000 },
  player1DisconnectedAt: Date,
  player2DisconnectedAt: Date,
  player1ReconnectDeadline: Date,
  player2ReconnectDeadline: Date,
  gameState: {
    score: { type: [Number], default: [0, 0] },
    paddles: {
      player1: { y: { type: Number, default: 0 } },
      player2: { y: { type: Number, default: 0 } }
    },
    hits: { type: Number, default: 0 },
    startedAt: Date
  },
  resultProcessed: {
    type: Boolean,
    default: false
  },
  endedAt: {
    type: Date
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt fields
});

// Compound indexes for efficient queries
gameSchema.index({ winnerAddress: 1, isStaked: 1, claimed: 1 }); // For "My Wins" queries
gameSchema.index({ isStaked: 1, claimed: 1 }); // For filtering staked unclaimed games
gameSchema.index({ createdAt: -1 }); // For recent games

// Method to mark game as claimed
gameSchema.methods.markAsClaimed = function(txHash) {
  this.claimed = true;
  this.claimTxHash = txHash;
  this.claimedAt = new Date();
  return this.save();
};

// Method to check if both players have staked
gameSchema.methods.bothPlayersStaked = function() {
  return this.isStaked &&
         this.player1Address &&
         this.player2Address &&
         this.player1TxHash &&
         this.player2TxHash;
};

// Method to calculate prize amount
gameSchema.methods.getPrizeAmount = function() {
  if (!this.stakeAmount) return '0';
  // Prize is 2x stake amount (both players' stakes)
  return (parseFloat(this.stakeAmount) * 2).toString();
};

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;
