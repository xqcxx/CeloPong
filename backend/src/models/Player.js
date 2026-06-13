const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  nameKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    index: true
  },
  rating: {
    type: Number,
    default: 1000,
    min: 0
  },
  gamesPlayed: {
    type: Number,
    default: 0,
    min: 0
  },
  wins: {
    type: Number,
    default: 0,
    min: 0
  },
  losses: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt fields
});

// Index for efficient sorting by rating
playerSchema.index({ rating: -1 });

// Method to update player stats after a game
playerSchema.methods.updateGameStats = function(gameResult, newRating) {
  this.gamesPlayed += 1;
  this.rating = newRating;
  
  if (gameResult === 'win') {
    this.wins += 1;
  } else if (gameResult === 'loss') {
    this.losses += 1;
  }
  
  this.lastActive = new Date();
  return this.save();
};

const Player = mongoose.model('Player', playerSchema);

module.exports = Player;

