const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const GameHandlers = require('./gameHandlers');
const MultiplayerHandler = require('./multiplayerHandler');
const Player = require('./models/Player');
const Game = require('./models/Game');
const signatureService = require('./services/signatureService');
const escrowVerificationService = require('./services/escrowVerificationService');
const walletSessionService = require('./services/walletSessionService');
const { getCorsOrigins } = require('./utils/corsOrigins');

const app = express();

// Enable only when diagnosing handshake issues; off by default to avoid leaking cookies/tokens
const ENABLE_SOCKET_HEADER_LOGS = process.env.SOCKET_HEADER_LOGS === 'true';
// Only log these non-sensitive headers
const SAFE_HEADER_KEYS = ['origin', 'referer', 'user-agent', 'host'];
const MAX_HEADER_VALUE_LENGTH = 200;

function sanitizeHeaders(input = {}) {
  return SAFE_HEADER_KEYS.reduce((acc, key) => {
    const value = input[key] || input[key.toLowerCase()];
    if (value) {
      acc[key] = typeof value === 'string'
        ? value.slice(0, MAX_HEADER_VALUE_LENGTH)
        : value;
    }
    return acc;
  }, {});
}

function maskAddress(address) {
  if (typeof address !== 'string') return address;
  const parts = address.split('.');
  if (parts.length === 4) {
    return ['x', 'x', 'x', parts[3]].join('.');
  }
  if (address.includes(':')) {
    return 'ipv6';
  }
  return address;
}

function truncate(value, max = 50) {
  if (typeof value !== 'string') return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function usernameRegistrationMessage(walletAddress, username) {
  return [
    'PONG-IT username registration',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Username: ${username}`
  ].join('\n');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function logSocketEvent(label, payload) {
  if (payload === undefined) {
    console.log(label);
    return;
  }
  console.log(label, payload);
}

function describeHeaders(input = {}) {
  return {
    allowed: sanitizeHeaders(input),
    total: Object.keys(input).length
  };
}

function describeOutgoingHeaders(input = {}) {
  const keys = Object.keys(input);
  return {
    keys: keys.slice(0, 10),
    total: keys.length
  };
}

// MongoDB Connection
// Default URI matches the docker-compose Mongo service
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pong-it';
console.log('Using MongoDB URI:', MONGODB_URI);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✓ Connected to MongoDB');
  console.log(`  Database: ${mongoose.connection.name}`);
})
.catch((error) => {
  console.error('✗ MongoDB connection error:', error);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('MongoDB error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Normalize FRONTEND_URL by removing trailing slash
const FRONTEND_URL = process.env.FRONTEND_URL?.replace(/\/$/, '');
const corsOrigins = getCorsOrigins(FRONTEND_URL);
function formatOrigins(origins) {
  return origins === true ? '*' : origins;
}

app.use(cors({
  origin: corsOrigins.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins.origins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*']
  },
  allowEIO3: true,
  transports: ['websocket'],
  path: '/socket.io/',
  connectTimeout: 45000,
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false,
  allowUpgrades: false,
  perMessageDeflate: false
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.walletSessionToken;
    socket.data.walletAddress = await walletSessionService.authenticateToken(token);
    next();
  } catch (error) {
    next(new Error('Unable to authenticate wallet session'));
  }
});

const gameHandlers = new GameHandlers(io);
const multiplayerHandler = new MultiplayerHandler(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    frontend_url: FRONTEND_URL || 'not set',
    cors: {
      origins: formatOrigins(corsOrigins.origins),
      source: corsOrigins.source,
    }
  });
});

app.get('/health/chain', async (req, res) => {
  try {
    const diagnostics = await escrowVerificationService.getChainDiagnostics();
    res.json({
      status: 'ok',
      ...diagnostics
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============ PLAYER ENDPOINTS ============

app.get('/auth/wallet-challenge/:walletAddress', async (req, res) => {
  try {
    res.status(200).json(
      await walletSessionService.createChallenge(req.params.walletAddress)
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/auth/wallet-session', async (req, res) => {
  try {
    res.status(200).json(
      await walletSessionService.verifyChallenge(req.body)
    );
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Get all players
app.get('/players', async (req, res) => {
  try {
    const playersList = await Player.find()
      .sort({ rating: -1 })
      .lean();
    res.status(200).json(playersList);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.get('/players/wallet/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Valid wallet address is required' });
    }

    const player = await Player.findOne({
      walletAddress: walletAddress.toLowerCase()
    }).lean();

    if (!player) {
      return res.status(404).json({ error: 'No username registered for this wallet' });
    }

    res.status(200).json(player);
  } catch (error) {
    console.error('Error fetching wallet username:', error);
    res.status(500).json({ error: 'Failed to fetch wallet username' });
  }
});

app.post('/players/register-username', async (req, res) => {
  try {
    const rawName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const walletAddress = req.body.walletAddress;
    const signature = req.body.signature;

    if (!/^[a-zA-Z0-9_-]{2,15}$/.test(rawName)) {
      return res.status(400).json({
        error: 'Username must be 2-15 characters using letters, numbers, _ or -'
      });
    }
    if (!ethers.isAddress(walletAddress) || !signature) {
      return res.status(400).json({ error: 'Wallet address and signature are required' });
    }

    const normalizedWallet = walletAddress.toLowerCase();
    const nameKey = rawName.toLowerCase();
    const recoveredAddress = ethers.verifyMessage(
      usernameRegistrationMessage(normalizedWallet, rawName),
      signature
    ).toLowerCase();

    if (recoveredAddress !== normalizedWallet) {
      return res.status(401).json({ error: 'Invalid wallet signature' });
    }

    const walletPlayer = await Player.findOne({ walletAddress: normalizedWallet });
    if (walletPlayer) {
      if (walletPlayer.nameKey === nameKey || walletPlayer.name.toLowerCase() === nameKey) {
        return res.status(200).json(walletPlayer);
      }
      return res.status(409).json({
        error: `This wallet is already registered as ${walletPlayer.name}`
      });
    }

    const namePlayer = await Player.findOne({
      $or: [
        { nameKey },
        { name: new RegExp(`^${escapeRegex(rawName)}$`, 'i') }
      ]
    });

    if (namePlayer?.walletAddress && namePlayer.walletAddress !== normalizedWallet) {
      return res.status(409).json({ error: 'Username is already registered' });
    }

    const player = namePlayer || new Player({
      name: rawName,
      rating: 1000,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      lastActive: new Date()
    });

    player.name = rawName;
    player.nameKey = nameKey;
    player.walletAddress = normalizedWallet;
    player.lastActive = new Date();
    await player.save();

    res.status(namePlayer ? 200 : 201).json(player);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Wallet or username is already registered' });
    }
    console.error('Error registering wallet username:', error);
    res.status(500).json({ error: 'Failed to register username' });
  }
});

// Get top players
app.get('/players/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const playersList = await Player.find()
      .sort({ rating: -1 })
      .limit(limit)
      .lean();
    res.status(200).json(playersList);
  } catch (error) {
    console.error('Error fetching top players:', error);
    res.status(500).json({ error: 'Failed to fetch top players' });
  }
});

// Legacy rankings endpoint (for backwards compatibility)
app.get('/rankings', async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const leaderboard = await multiplayerHandler.leaderboardManager.getTopPlayers(limit);
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching rankings:', error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

// Proxy endpoint for backwards compatibility
app.get('/api/rankings/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const playersList = await Player.find()
      .sort({ rating: -1 })
      .limit(limit)
      .lean();
    res.json(playersList);
  } catch (error) {
    console.error('Error fetching rankings:', error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

// Get player by name
app.get('/players/:name', async (req, res) => {
  try {
    const player = await Player.findOne({ name: req.params.name }).lean();
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.status(200).json(player);
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// Proxy endpoint for backwards compatibility
app.get('/api/players/:name', async (req, res) => {
  try {
    const player = await Player.findOne({ name: req.params.name }).lean();
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.status(200).json(player);
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// Create or update player
app.post('/players', async (req, res) => {
  try {
    const { name, rating, gameResult } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    let player = await Player.findOne({ name });

    if (!player) {
      // Create new player
      player = new Player({
        name,
        rating: rating || 1000,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        lastActive: new Date()
      });
    } else {
      // Update existing player
      if (rating !== undefined) {
        player.rating = rating;
      }
      player.lastActive = new Date();
    }

    // Update stats if game result is provided
    if (gameResult) {
      player.gamesPlayed += 1;
      if (gameResult === 'win') {
        player.wins += 1;
      } else if (gameResult === 'loss') {
        player.losses += 1;
      }
    }

    await player.save();
    res.status(200).json(player);
  } catch (error) {
    console.error('Error updating player:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// Update player rating after a game
app.patch('/players/:name/rating', async (req, res) => {
  try {
    const { name } = req.params;
    const { newRating, gameResult } = req.body;

    if (newRating === undefined) {
      return res.status(400).json({ error: 'New rating is required' });
    }

    const player = await Player.findOne({ name });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    player.rating = newRating;
    player.lastActive = new Date();

    // Update game stats if provided
    if (gameResult) {
      player.gamesPlayed += 1;
      if (gameResult === 'win') {
        player.wins += 1;
      } else if (gameResult === 'loss') {
        player.losses += 1;
      }
    }

    await player.save();
    res.status(200).json(player);
  } catch (error) {
    console.error('Error updating player rating:', error);
    res.status(500).json({ error: 'Failed to update player rating' });
  }
});

// ============ GAME ENDPOINTS ============

// Create or save game result
app.post('/games', async (req, res) => {
  try {
    const {
      roomCode,
      player1,
      player2,
      winner,
      score,
      isStaked,
      stakeAmount,
      stakeCurrency,
      player1Address,
      player2Address,
      player1TxHash,
      player2TxHash,
      status
    } = req.body;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    // Check if game already exists
    let game = await Game.findOne({ roomCode });

    // Convert score array to object if needed
    let scoreObject = score;
    if (score && Array.isArray(score)) {
      scoreObject = { player1: score[0], player2: score[1] };
    }

    if (game) {
      // Update existing game
      if (player2) game.player2 = player2;
      if (winner) game.winner = winner;
      if (scoreObject) game.score = scoreObject;
      if (player2Address) game.player2Address = player2Address?.toLowerCase();
      if (player2TxHash) game.player2TxHash = player2TxHash;
      if (winner) {
        game.status = 'finished';
        game.endedAt = new Date();
        game.winnerAddress = winner === 'player1' ? game.player1Address : game.player2Address;
      }
    } else {
      // Create new game
      game = new Game({
        roomCode,
        player1,
        player2,
        winner,
        score: scoreObject,
        isStaked: isStaked || false,
        stakeAmount,
        stakeCurrency: stakeCurrency || 'CELO',
        player1Address: player1Address?.toLowerCase(),
        player2Address: player2Address?.toLowerCase(),
        player1TxHash,
        player2TxHash,
        status: status || (player2 ? 'playing' : 'waiting'),
        lifecyclePhase: isStaked
          ? (player2 ? 'ready' : 'waiting_for_player2')
          : undefined,
        joinDeadline: isStaked ? new Date(Date.now() + 10 * 60 * 1000) : undefined,
        player1Connected: false,
        player2Connected: false
      });
    }

    // Generate signature if game finished and staked
    if (game.isStaked && game.winner && game.winnerAddress && !game.winnerSignature) {
      if (signatureService.isReady()) {
        try {
          const signature = await signatureService.signWinner(
            roomCode,
            game.winnerAddress,
            stakeAmount
          );
          game.winnerSignature = signature;
          console.log('✅ Winner signature generated for room:', roomCode);
        } catch (error) {
          console.error('❌ Failed to generate signature:', error);
          // Continue saving game even if signature fails
        }
      } else {
        console.warn('⚠️  Signature service not ready, skipping signature generation');
      }
    }

    await game.save();
    res.status(200).json(game);
  } catch (error) {
    console.error('Error saving game:', error);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Get user's wins (for claiming interface)
app.get('/games/my-wins', async (req, res) => {
  try {
    const { address, limit = 20, offset = 0 } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const query = {
      winnerAddress: address.toLowerCase(),
      isStaked: true,
      status: 'finished'
    };

    // Fetch games with pagination
    const games = await Game.find(query)
      .sort({ endedAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalGames = await Game.countDocuments(query);

    res.status(200).json({
      games,
      pagination: {
        total: totalGames,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalGames
      }
    });
  } catch (error) {
    console.error('Error fetching user wins:', error);
    res.status(500).json({ error: 'Failed to fetch wins' });
  }
});

// Mark game as claimed
app.post('/games/:gameId/claimed', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { txHash } = req.body;

    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.claimed) {
      return res.status(400).json({ error: 'Prize already claimed' });
    }

    await game.markAsClaimed(txHash);

    res.status(200).json({ success: true, game });
  } catch (error) {
    console.error('Error marking game as claimed:', error);
    res.status(500).json({ error: 'Failed to mark game as claimed' });
  }
});

// Get player game history with filters
app.get('/games/player/:playerName/history', async (req, res) => {
  try {
    const { playerName } = req.params;
    const {
      filter = 'all',        // all, wins, losses
      staked,                // true, false, or undefined (all)
      limit = 50,
      offset = 0
    } = req.query;

    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Build the query
    const query = {
      status: 'finished', // Only finished games
      $or: [
        { 'player1.name': playerName },
        { 'player2.name': playerName }
      ]
    };

    // Filter by staked/unstaked
    if (staked !== undefined) {
      query.isStaked = staked === 'true';
    }

    // Filter by wins/losses
    if (filter === 'wins') {
      query.winner = { $exists: true };
      query.$or = [
        { 'player1.name': playerName, winner: 'player1' },
        { 'player2.name': playerName, winner: 'player2' }
      ];
    } else if (filter === 'losses') {
      query.winner = { $exists: true };
      query.$or = [
        { 'player1.name': playerName, winner: 'player2' },
        { 'player2.name': playerName, winner: 'player1' }
      ];
    }

    // Fetch games with pagination
    const games = await Game.find(query)
      .sort({ endedAt: -1, createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalGames = await Game.countDocuments(query);

    // Calculate stats
    const allGamesQuery = {
      status: 'finished',
      $or: [
        { 'player1.name': playerName },
        { 'player2.name': playerName }
      ]
    };

    const allGames = await Game.find(allGamesQuery).lean();

    const stats = {
      totalGames: allGames.length,
      wins: allGames.filter(g =>
        (g.player1?.name === playerName && g.winner === 'player1') ||
        (g.player2?.name === playerName && g.winner === 'player2')
      ).length,
      losses: allGames.filter(g =>
        (g.player1?.name === playerName && g.winner === 'player2') ||
        (g.player2?.name === playerName && g.winner === 'player1')
      ).length,
      stakedGames: allGames.filter(g => g.isStaked).length,
      totalEarnings: allGames
        .filter(g =>
          g.isStaked &&
          g.claimed &&
          ((g.player1?.name === playerName && g.winner === 'player1') ||
           (g.player2?.name === playerName && g.winner === 'player2'))
        )
        .reduce((sum, g) => sum + parseFloat(g.stakeAmount || 0), 0)
    };

    stats.winRate = stats.totalGames > 0
      ? ((stats.wins / stats.totalGames) * 100).toFixed(1)
      : 0;

    // Transform games for frontend
    const gamesWithDetails = games.map(game => ({
      ...game,
      opponent: game.player1?.name === playerName
        ? game.player2?.name
        : game.player1?.name,
      result: !game.winner ? 'draw' :
        (game.player1?.name === playerName && game.winner === 'player1') ||
        (game.player2?.name === playerName && game.winner === 'player2')
          ? 'win' : 'loss',
      finalScore: game.score ?
        (game.player1?.name === playerName
          ? `${game.score.player1}-${game.score.player2}`
          : `${game.score.player2}-${game.score.player1}`)
        : 'N/A'
    }));

    res.status(200).json({
      games: gamesWithDetails,
      stats,
      pagination: {
        total: totalGames,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalGames
      }
    });
  } catch (error) {
    console.error('Error fetching game history:', error);
    res.status(500).json({ error: 'Failed to fetch game history' });
  }
});

// Get open challenges for the challenge board — MUST be before /games/:roomCode
app.get('/games/challenges', async (req, res) => {
  try {
    const challenges = await Game.find({
      isStaked: true,
      status: 'waiting',
      challengeCreated: true,
      challengeAccepted: false
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json(challenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

app.get('/games/pending-stakes/:playerAddress', async (req, res) => {
  try {
    const playerAddress = req.params.playerAddress?.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(playerAddress || '')) {
      return res.status(400).json({ error: 'Valid player address is required' });
    }

    const games = await Game.find({
      isStaked: true,
      player1Address: playerAddress,
      player2TxHash: { $in: [null, ''] },
      status: { $in: ['waiting', 'cancelled'] }
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(games);
  } catch (error) {
    console.error('Error fetching pending stakes:', error);
    res.status(500).json({ error: 'Failed to fetch pending stakes' });
  }
});

app.get('/games/active-staked', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const walletAddress = await walletSessionService.authenticateToken(token);
    if (!walletAddress) {
      return res.status(401).json({ error: 'Valid wallet session required' });
    }

    const games = await Game.find({
      isStaked: true,
      status: { $in: ['waiting', 'playing', 'paused', 'abandoned'] },
      $or: [
        { player1Address: walletAddress },
        { player2Address: walletAddress }
      ]
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json(games.map(game => ({
      roomCode: game.roomCode,
      role: game.player1Address === walletAddress ? 'player1' : 'player2',
      lifecyclePhase: game.lifecyclePhase,
      status: game.status,
      score: game.gameState?.score || [game.score?.player1 || 0, game.score?.player2 || 0],
      joinDeadline: game.joinDeadline,
      player1ReconnectDeadline: game.player1ReconnectDeadline,
      player2ReconnectDeadline: game.player2ReconnectDeadline,
      player1ReconnectRemainingMs: game.player1ReconnectRemainingMs,
      player2ReconnectRemainingMs: game.player2ReconnectRemainingMs,
      abandonmentSignature: game.abandonmentSignature,
      stakeAmount: game.stakeAmount,
      stakeCurrency: game.stakeCurrency
    })));
  } catch (error) {
    console.error('Error fetching active staked matches:', error);
    res.status(500).json({ error: 'Failed to fetch active staked matches' });
  }
});

app.post('/games/:roomCode/refunded', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerAddress } = req.body;

    await escrowVerificationService.verifyRefund({ roomCode, playerAddress });

    const game = await Game.findOneAndUpdate(
      {
        roomCode,
        $or: [
          { player1Address: playerAddress.toLowerCase() },
          { player2Address: playerAddress.toLowerCase() }
        ]
      },
      {
        status: 'refunded',
        challengeAccepted: false,
        challengeCreated: false,
        endedAt: new Date()
      },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({ error: 'Game record not found' });
    }

    res.status(200).json(game);
  } catch (error) {
    console.error('Error confirming refund:', error);
    res.status(400).json({ error: error.message || 'Failed to confirm refund' });
  }
});

// Get game by room code
app.get('/games/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;

    const game = await Game.findOne({ roomCode }).lean();

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.status(200).json(game);
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

try {
  if (!ENABLE_SOCKET_HEADER_LOGS) {
    console.log('Socket header logging disabled (SOCKET_HEADER_LOGS!=true)');
  } else {
    console.warn('Socket header logging ENABLED; sensitive data may appear in logs');
  }
  // Socket.IO engine emits headers; be careful not to leak sensitive values
  io.engine.on("headers", (headers, req) => {
    if (!ENABLE_SOCKET_HEADER_LOGS) return;
    console.log('Headers being sent (summary):', describeOutgoingHeaders(headers));
    console.log('Request headers (sanitized):', describeHeaders(req.headers));
  });

  // Initial headers at handshake time may include auth/cookies
  io.engine.on("initial_headers", (headers, req) => {
    if (!ENABLE_SOCKET_HEADER_LOGS) return;
    console.log('Initial headers being sent (summary):', describeOutgoingHeaders(headers));
    console.log('Initial request headers (sanitized):', describeHeaders(req.headers));
  });

  io.on('connection', (socket) => {
    const username = truncate(socket.handshake.query.username);
    logSocketEvent('New connection:', {
      socketId: socket.id,
      username,
      transport: socket.conn.transport.name,
      address: maskAddress(socket.handshake.address)
    });

    const existingSockets = Array.from(io.sockets.sockets.values());
    for (const existingSocket of existingSockets) {
      if (existingSocket.id !== socket.id &&
          existingSocket.handshake.query.username === username) {
        logSocketEvent('Cleaning up old connection for:', username);
        gameHandlers.handleDisconnect(existingSocket);
        existingSocket.disconnect(true);
      }
    }

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    gameHandlers.handleConnection(socket);
    multiplayerHandler.handleConnection(socket);

    socket.on('disconnect', (reason) => {
      console.log(`Client ${socket.id} disconnected:`, reason);
    });
  });

  io.engine.on("connection_error", (err) => {
    console.error('Connection error:', {
      type: err.type,
      description: err.description,
      context: err.context,
      require: err.require,
      message: err.message,
      stack: err.stack
    });
  });

  httpServer.on('error', (error) => {
    console.error('HTTP Server error:', error);
  });

  io.on('error', (error) => {
    console.error('Socket.IO error:', error);
  });

  const PORT = process.env.PORT || 8080;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Server accepting connections from: ${FRONTEND_URL || "all origins (debug mode)"}`);
    console.log('CORS origins:', formatOrigins(corsOrigins.origins), 'source:', corsOrigins.source);
    if (corsOrigins.source === 'wildcard') {
      console.warn('[CORS] Allowing all origins. Do not use in production.');
    }
    console.log(`Health check available at http://localhost:${PORT}/health`);
    
    const addresses = Object.values(require('os').networkInterfaces())
      .flat()
      .filter(({family, internal}) => family === 'IPv4' && !internal)
      .map(({address}) => address);
    
    console.log('Server bound to addresses:', addresses);

    // Self-ping mechanism to prevent cold starts on Render free tier
    // Only runs when KEEP_RENDER_ALIVE environment variable is set
    if (process.env.KEEP_RENDER_ALIVE === 'true') {
      // Render free tier spins down after 15 minutes of inactivity
      const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds
      setInterval(() => {
        const http = require('http');
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/health',
          method: 'GET'
        };

        const req = http.request(options, (res) => {
          console.log(`Self-ping successful: ${res.statusCode}`);
        });

        req.on('error', (error) => {
          console.error('Self-ping failed:', error.message);
        });

        req.end();
      }, PING_INTERVAL);

      console.log(`Self-ping enabled: pinging /health every 14 minutes to prevent cold start`);
    }
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
} 
