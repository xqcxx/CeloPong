const RoomManager = require('./roomManager');
const GameManager = require('./gameManager');
const LeaderboardManager = require('./leaderboardManager');
const Game = require('./models/Game');
const Player = require('./models/Player');
const signatureService = require('./services/signatureService');
const escrowVerificationService = require('./services/escrowVerificationService');
const emitLeaderboardUpdate = require('./utils/emitLeaderboardUpdate');

const RECONNECT_BUDGET_MS = 5 * 60 * 1000;
const JOIN_TIMEOUT_MS = 10 * 60 * 1000;

class MultiplayerHandler {
  constructor(io) {
    this.io = io;
    this.roomManager = new RoomManager();
    this.gameManager = new GameManager();
    this.leaderboardManager = new LeaderboardManager();
    this.gameLoops = new Map();
    this.lastPersistedScores = new Map();

    setInterval(() => {
      const removedRooms = this.roomManager.cleanupStaleRooms();
      removedRooms.forEach(room => {
        if (!room.isStaked) this.markWaitingStakedRoomCancelled(room);
      });
    }, 60000);

    setInterval(() => {
      this.settleReconnectDeadlines().catch(error => {
        console.error('Failed to settle reconnect deadlines:', error);
      });
    }, 1000);

    this.rehydrateStakedRooms().catch(error => {
      console.error('Failed to rehydrate staked rooms:', error);
    });
  }

  async rehydrateStakedRooms() {
    const games = await Game.find({
      isStaked: true,
      status: { $in: ['waiting', 'playing', 'paused'] }
    });

    for (const record of games) {
      if (!record.joinDeadline) {
        record.joinDeadline = new Date(record.createdAt.getTime() + JOIN_TIMEOUT_MS);
      }
      if (record.resultProcessed == null) {
        record.resultProcessed = false;
      }
      record.player1Connected = false;
      record.player2Connected = false;
      if (record.player2Address) {
        record.status = 'paused';
        record.lifecyclePhase = 'paused_reconnect';
        const now = Date.now();
        if (!record.player1ReconnectDeadline) {
          record.player1DisconnectedAt = new Date(now);
          record.player1ReconnectDeadline = new Date(
            now + (record.player1ReconnectRemainingMs ?? RECONNECT_BUDGET_MS)
          );
        }
        if (!record.player2ReconnectDeadline) {
          record.player2DisconnectedAt = new Date(now);
          record.player2ReconnectDeadline = new Date(
            now + (record.player2ReconnectRemainingMs ?? RECONNECT_BUDGET_MS)
          );
        }
      } else {
        record.lifecyclePhase = 'waiting_for_player2';
      }
      await record.save();

      const room = this.roomManager.restoreStakedRoom(record);
      if (record.player2Address) {
        const game = this.gameManager.createGame(
          record.roomCode,
          room.host,
          room.guest,
          record.gameState
        );
        game.isPaused = true;
        game.reconnectPaused = true;
      }
    }
  }

  authenticatedWallet(socket) {
    return socket.data?.walletAddress?.toLowerCase() || null;
  }

  requireStakedWallet(socket, requestedWallet) {
    const authenticated = this.authenticatedWallet(socket);
    if (!authenticated) {
      throw new Error('Sign in with your wallet before entering a staked room');
    }
    if (requestedWallet && authenticated !== requestedWallet.toLowerCase()) {
      throw new Error('Authenticated wallet does not match player wallet');
    }
    return authenticated;
  }

  roomState(record) {
    return {
      roomCode: record.roomCode,
      lifecyclePhase: record.lifecyclePhase,
      status: record.status,
      serverTime: Date.now(),
      joinDeadline: record.joinDeadline?.getTime?.() || null,
      player1Connected: record.player1Connected,
      player2Connected: record.player2Connected,
      player1ReconnectDeadline: record.player1ReconnectDeadline?.getTime?.() || null,
      player2ReconnectDeadline: record.player2ReconnectDeadline?.getTime?.() || null,
      player1ReconnectRemainingMs: record.player1ReconnectRemainingMs,
      player2ReconnectRemainingMs: record.player2ReconnectRemainingMs,
      score: record.gameState?.score || [record.score?.player1 || 0, record.score?.player2 || 0],
      player1Address: record.player1Address,
      player2Address: record.player2Address
    };
  }

  async emitRoomState(record) {
    this.io.to(record.roomCode).emit('stakedRoomState', this.roomState(record));
  }

  handleConnection(socket) {
    const username = socket.handshake.query.username;

    socket.on('createRoom', (player, roomCode) => {
      this.handleCreateRoom(socket, player, roomCode);
    });

    socket.on('joinRoom', (data) => {
      this.handleJoinRoom(socket, data);
    });

    socket.on('rejoinStakedRoom', (data) => {
      this.handleRejoinStakedRoom(socket, data);
    });

    socket.on('findRandomMatch', (player) => {
      this.handleFindRandomMatch(socket, player);
    });

    socket.on('player2StakeCompleted', (data) => {
      this.handlePlayer2StakeCompleted(socket, data);
    });

    socket.on('cancelPendingStake', () => {
      this.handleCancelPendingStake(socket);
    });

    socket.on('spectateGame', (data) => {
      this.handleSpectateGame(socket, data);
    });

    socket.on('leaveSpectate', () => {
      this.handleLeaveSpectate(socket);
    });

    socket.on('getActiveGames', () => {
      const activeGames = this.roomManager.getActiveGames();
      socket.emit('activeGamesList', activeGames);
    });

    socket.on('paddleMove', (data) => {
      this.handlePaddleMove(socket, data);
    });

    socket.on('pauseGame', () => {
      this.handlePauseGame(socket);
    });

    socket.on('forfeitGame', () => {
      this.handleForfeitGame(socket);
    });

    socket.on('requestRematch', () => {
      this.handleRematchRequest(socket);
    });

    socket.on('rematchResponse', (data) => {
      this.handleRematchResponse(socket, data);
    });

    socket.on('leaveRoom', () => {
      this.handleLeaveRoom(socket);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket).catch(error => {
        console.error('Failed to process disconnect:', error);
      });
    });

    socket.on('getLeaderboard', async () => {
      const leaderboard = await this.leaderboardManager.getTopPlayers(10);
      emitLeaderboardUpdate(socket, leaderboard);
    });

    if (username) {
      this.leaderboardManager.getPlayerRating(username).then(rating => {
        socket.emit('playerRating', { name: username, rating });
      });
    }
  }

  async handleCreateRoom(socket, player, providedRoomCode) {
    const identity = await this.validatePlayerIdentity(player);
    if (!identity.success) {
      socket.emit('error', { message: identity.error });
      return;
    }

    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      socket.emit('error', { message: 'Already in a room' });
      return;
    }

    if (providedRoomCode) {
      try {
        const walletAddress = this.requireStakedWallet(socket, player.walletAddress);
        player.walletAddress = walletAddress;
        const existingRecord = await Game.findOne({ roomCode: providedRoomCode });
        const restoredRoom = this.roomManager.getRoom(providedRoomCode);
        if (existingRecord?.isStaked && restoredRoom) {
          await this.handleRejoinStakedRoom(socket, { roomCode: providedRoomCode });
          return;
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
        return;
      }
    }

    // Use provided room code for staked matches, or generate new one
    const roomCode = providedRoomCode || this.roomManager.createRoom(player, socket.id);

    // If room code was provided, create room with that specific code
    if (providedRoomCode) {
      this.roomManager.createRoomWithCode(roomCode, player, socket.id);
    }

    socket.join(roomCode);

    console.log(`Room created: ${roomCode} by ${player.name} (${socket.id})`);

    socket.emit('roomCreated', {
      roomCode,
      room: this.roomManager.getRoom(roomCode)
    });

    if (providedRoomCode) {
      const matchData = await escrowVerificationService.getMatch(roomCode);
      const authenticatedWallet = this.authenticatedWallet(socket);
      if (matchData.player1.toLowerCase() !== authenticatedWallet) {
        this.roomManager.endGame(roomCode);
        socket.emit('error', { message: 'Connected wallet did not create this on-chain match' });
        return;
      }
      const createdAt = Number(matchData.createdAt) * 1000;
      const gameRecord = await Game.findOneAndUpdate(
        { roomCode },
        {
          lifecyclePhase: 'waiting_for_player2',
          status: 'waiting',
          joinDeadline: new Date(createdAt + JOIN_TIMEOUT_MS),
          player1Connected: true
        },
        { new: true }
      );
      if (gameRecord) await this.emitRoomState(gameRecord);
    }
  }

  async handleJoinRoom(socket, { roomCode, player }) {
    console.log(`🔵 handleJoinRoom called - Room: ${roomCode}, Player: ${player?.name}, Socket: ${socket.id}`);

    const identity = await this.validatePlayerIdentity(player);
    if (!identity.success) {
      socket.emit('error', { message: identity.error });
      return;
    }

    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      console.log(`❌ Player ${socket.id} already in room ${existingRoom.code}`);
      socket.emit('error', { message: 'Already in a room' });
      return;
    }

    try {
      console.log(`📡 Checking for staked match in database: ${roomCode}`);
      const gameRecord = await Game.findOne({ roomCode });

      if (gameRecord?.isStaked) {
        let walletAddress;
        try {
          walletAddress = this.requireStakedWallet(socket, player.walletAddress);
          player.walletAddress = walletAddress;
        } catch (error) {
          socket.emit('error', { message: error.message });
          return;
        }

        if (walletAddress === gameRecord.player1Address ||
            walletAddress === gameRecord.player2Address) {
          await this.handleRejoinStakedRoom(socket, { roomCode });
          return;
        }

        if (gameRecord.player2TxHash) {
          socket.emit('error', { message: 'This staked room has already been joined' });
          return;
        }

        if (gameRecord.joinDeadline &&
            gameRecord.joinDeadline.getTime() <= Date.now()) {
          socket.emit('error', { message: 'This room has expired' });
          return;
        }

        let room = this.roomManager.getRoom(roomCode);
        if (!room) room = this.roomManager.restoreStakedRoom(gameRecord);
        const reservation = this.roomManager.reserveRoom(room.code, player, socket.id);
        if (!reservation.success) {
          socket.emit('error', { message: reservation.error });
          return;
        }

        socket.emit('stakedMatchJoined', {
          roomCode,
          stakeAmount: gameRecord.stakeAmount,
          stakeCurrency: gameRecord.stakeCurrency || 'CELO',
          player1Address: gameRecord.player1Address
        });
        this.io.to(roomCode).emit('waitingForPlayer2Stake', {
          stakeAmount: gameRecord.stakeAmount,
          stakeCurrency: gameRecord.stakeCurrency || 'CELO'
        });
        return;
      }
    } catch (error) {
      console.error('❌ Error checking for staked match:', error);
      socket.emit('error', { message: 'Unable to verify room staking status. Please try again.' });
      return;
    }

    const result = this.roomManager.joinRoom(roomCode, player, socket.id);
    if (!result.success) {
      console.log(`❌ Failed to join room ${roomCode}: ${result.error}`);
      socket.emit('error', { message: result.error });
      return;
    }

    socket.join(roomCode);
    console.log(`🎮 Starting normal game for room ${roomCode}`);
    this.io.to(roomCode).emit('roomReady', {
      room: result.room
    });

    this.startGame(roomCode);
  }

  async handleRejoinStakedRoom(socket, { roomCode }) {
    try {
      const walletAddress = this.requireStakedWallet(socket);
      const record = await Game.findOne({
        roomCode,
        isStaked: true,
        $or: [
          { player1Address: walletAddress },
          { player2Address: walletAddress }
        ]
      });
      if (!record) {
        throw new Error('No active staked room found for this wallet');
      }
      if (['finished', 'abandoned', 'refunded'].includes(record.status)) {
        throw new Error('This staked match has already ended');
      }
      if (!record.player2Address &&
          record.joinDeadline?.getTime?.() <= Date.now()) {
        throw new Error('This room expired. Claim the unmatched stake refund instead.');
      }

      let room = this.roomManager.getRoom(roomCode);
      if (!room) room = this.roomManager.restoreStakedRoom(record);

      const role = record.player1Address === walletAddress ? 'player1' : 'player2';
      const player = role === 'player1' ? record.player1 : record.player2;
      const playerData = player?.toObject ? player.toObject() : player;
      const result = this.roomManager.reconnectPlayer(
        roomCode,
        walletAddress,
        socket.id,
        { ...playerData, walletAddress }
      );
      if (!result.success) throw new Error(result.error);

      socket.join(roomCode);
      const deadlineField = `${role}ReconnectDeadline`;
      const remainingField = `${role}ReconnectRemainingMs`;
      const connectedField = `${role}Connected`;
      const disconnectedField = `${role}DisconnectedAt`;
      const deadline = record[deadlineField]?.getTime?.();
      const ownExpired = Boolean(deadline && deadline <= Date.now());
      if (deadline) {
        record[remainingField] = Math.max(0, deadline - Date.now());
      }
      if (!ownExpired) {
        record[deadlineField] = null;
        record[disconnectedField] = null;
      }
      record[connectedField] = true;

      if (record.player2Address) {
        const isStartingAfterPlayer1Return =
          record.lifecyclePhase === 'waiting_for_player1_return';
        let game = this.gameManager.getGame(roomCode);
        if (!game) {
          game = this.gameManager.createGame(
            roomCode,
            room.host,
            room.guest,
            record.gameState
          );
          game.isPaused = true;
          game.reconnectPaused = true;
        }
        this.gameManager.reconnectPlayer(roomCode, walletAddress, socket.id);

        const otherRole = role === 'player1' ? 'player2' : 'player1';
        if (ownExpired && record[`${otherRole}Connected`]) {
          await record.save();
          await this.finishByRole(record, otherRole, 'disconnect_timeout');
          return;
        }
        const otherExpired = (record[`${otherRole}ReconnectDeadline`]?.getTime?.() || Infinity) <= Date.now();
        if (otherExpired) {
          await record.save();
          await this.finishByRole(record, role, 'disconnect_timeout');
          return;
        }

        if (record.player1Connected && record.player2Connected) {
          record.status = 'playing';
          record.lifecyclePhase = 'playing';
          this.gameManager.resumeAfterReconnect(roomCode);
          this.startGameLoop(roomCode);
          if (isStartingAfterPlayer1Return) {
            this.io.to(roomCode).emit('gameStart', game);
          } else {
            this.io.to(roomCode).emit('gameResumed');
          }
        } else {
          record.status = 'paused';
          record.lifecyclePhase = role === 'player2' && !record.player1Connected
            ? 'waiting_for_player1_return'
            : 'paused_reconnect';
        }
      } else {
        record.status = 'waiting';
        record.lifecyclePhase = 'waiting_for_player2';
      }

      await record.save();
      socket.emit('stakedRoomRejoined', {
        role,
        roomState: this.roomState(record),
        game: this.gameManager.getGame(roomCode)
      });
      await this.emitRoomState(record);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  async handlePlayer2StakeCompleted(socket, { roomCode, txHash, playerAddress, chainId }) {
    let authenticatedWallet;
    try {
      authenticatedWallet = this.requireStakedWallet(socket, playerAddress);
    } catch (error) {
      socket.emit('player2StakeVerificationFailed', { message: error.message });
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.pendingGuest?.socketId !== socket.id) {
      socket.emit('error', { message: 'You do not hold the staking reservation for this room' });
      return;
    }

    try {
      const verifiedStake = await escrowVerificationService.verifyPlayer2Stake({
        roomCode,
        txHash,
        playerAddress: authenticatedWallet,
        chainId
      });
      const gameRecord = await Game.findOne({ roomCode });
      if (!gameRecord?.isStaked) {
        throw new Error('Staked game record not found');
      }

      gameRecord.player2 = {
        name: room.pendingGuest.name,
        rating: room.pendingGuest.rating
      };
      gameRecord.player2Address = verifiedStake.player2Address;
      gameRecord.player2TxHash = verifiedStake.player2TxHash;
      gameRecord.challengeAccepted = true;

      const result = this.roomManager.commitReservedGuest(roomCode, socket.id);
      if (!result.success) {
        throw new Error(result.error);
      }

      socket.join(roomCode);
      this.io.to(roomCode).emit('roomReady', { room: result.room });
      gameRecord.player2Connected = true;
      if (gameRecord.player1Connected) {
        gameRecord.status = 'playing';
        gameRecord.lifecyclePhase = 'playing';
        await gameRecord.save();
        this.startGame(roomCode);
      } else {
        const now = Date.now();
        gameRecord.status = 'paused';
        gameRecord.lifecyclePhase = 'waiting_for_player1_return';
        gameRecord.player1DisconnectedAt = new Date(now);
        gameRecord.player1ReconnectDeadline = new Date(
          now + gameRecord.player1ReconnectRemainingMs
        );
        await gameRecord.save();
        const game = this.gameManager.createGame(
          roomCode,
          result.room.host,
          result.room.guest,
          gameRecord.gameState
        );
        game.isPaused = true;
        game.reconnectPaused = true;
      }
      await this.emitRoomState(gameRecord);
    } catch (error) {
      console.error('Player 2 stake verification failed:', error);
      socket.emit('player2StakeVerificationFailed', {
        message: error.message || 'Unable to verify staking transaction'
      });
    }
  }

  handleCancelPendingStake(socket) {
    const room = this.roomManager.releaseReservation(socket.id);
    if (room) {
      socket.emit('pendingStakeCancelled');
      this.io.to(room.code).emit('waitingForOpponent', { roomCode: room.code });
    }
  }

  async handleFindRandomMatch(socket, player) {
    const identity = await this.validatePlayerIdentity(player);
    if (!identity.success) {
      socket.emit('error', { message: identity.error });
      return;
    }

    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      socket.emit('error', { message: 'Already in a room' });
      return;
    }

    const availableRooms = Array.from(this.roomManager.rooms.values())
      .filter(room =>
        room.status === 'waiting' &&
        !room.guest &&
        !room.pendingGuest &&
        !room.isStaked
      );

    if (availableRooms.length > 0) {
      const room = availableRooms[0];
      this.handleJoinRoom(socket, { roomCode: room.code, player });
    } else {
      const roomCode = this.roomManager.createRoom(player, socket.id);
      socket.join(roomCode);
      socket.emit('waitingForOpponent', { roomCode });
    }
  }

  async startGame(roomCode) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room || room.status !== 'ready') return;

    this.roomManager.startGame(roomCode);

    const gameState = this.gameManager.createGame(
      roomCode,
      room.host,
      room.guest
    );

    this.io.to(roomCode).emit('gameStart', gameState);

    if (room.isStaked) {
      await Game.updateOne(
        { roomCode },
        {
          status: 'playing',
          lifecyclePhase: 'playing',
          player1Connected: true,
          player2Connected: true,
          gameState: {
            score: gameState.score,
            paddles: gameState.paddles,
            hits: gameState.hits,
            startedAt: new Date(gameState.startTime)
          }
        }
      );
    }

    this.startGameLoop(roomCode);
  }

  startGameLoop(roomCode) {
    if (this.gameLoops.has(roomCode)) {
      clearInterval(this.gameLoops.get(roomCode));
    }

    const interval = setInterval(() => {
      const result = this.gameManager.updateGameState(roomCode);

      if (!result) {
        const game = this.gameManager.getGame(roomCode);
        if (!game || game.status !== 'active') {
          clearInterval(interval);
          this.gameLoops.delete(roomCode);
        }
        return;
      }

      if (result.gameOver) {
        this.handleGameOver(roomCode, result.winner, result.game, 'score');
        clearInterval(interval);
        this.gameLoops.delete(roomCode);
        return;
      }

      const scoreKey = result.score?.join(':');
      if (scoreKey && this.lastPersistedScores.get(roomCode) !== scoreKey) {
        this.lastPersistedScores.set(roomCode, scoreKey);
        Game.updateOne(
          { roomCode, isStaked: true },
          {
            'gameState.score': result.score,
            'gameState.paddles': result.paddles,
            'gameState.hits': result.hits,
            score: { player1: result.score[0], player2: result.score[1] }
          }
        ).catch(error => console.error('Failed to persist staked score:', error));
      }

      this.io.to(roomCode).emit('gameUpdate', result);
    }, 1000 / 60);

    this.gameLoops.set(roomCode, interval);
  }

  async handleGameOver(roomCode, winner, game, resultReason = 'score') {
    if (!winner) {
      this.endGame(roomCode);
      return;
    }
    const loser = game.players.find(p => p.walletAddress !== winner.walletAddress);
    if (!loser) {
      this.endGame(roomCode);
      return;
    }

    const winnerRole = game.players[0].walletAddress === winner.walletAddress
      ? 'player1'
      : 'player2';
    const scoreObject = game.score
      ? { player1: game.score[0], player2: game.score[1] }
      : { player1: 0, player2: 0 };

    let ratingResult = null;
    let gameRecord = await Game.findOne({ roomCode });

    if (gameRecord?.isStaked) {
      const winnerAddress = winnerRole === 'player1'
        ? gameRecord.player1Address
        : gameRecord.player2Address;
      const escrowAddress = gameRecord.escrowAddress || process.env.PONG_ESCROW_ADDRESS?.toLowerCase();
      const chainId = gameRecord.chainId || Number(process.env.CELO_CHAIN_ID);
      let resultSignature = gameRecord.resultSignature;

      if (!resultSignature && signatureService.isReady()) {
        try {
          resultSignature = await signatureService.signResult({
            chainId,
            contractAddress: escrowAddress,
            roomCode,
            player1Address: gameRecord.player1Address,
            player2Address: gameRecord.player2Address,
            winnerAddress,
            score1: scoreObject.player1,
            score2: scoreObject.player2,
            resultReason
          });
        } catch (error) {
          console.error(`Failed to sign final result for ${roomCode}:`, error);
        }
      }

      gameRecord = await Game.findOneAndUpdate(
        { _id: gameRecord._id, resultProcessed: false },
        {
          resultProcessed: true,
          winner: winnerRole,
          winnerAddress,
          score: scoreObject,
          status: 'finished',
          lifecyclePhase: 'finished',
          resultReason,
          resultSignature,
          escrowAddress,
          chainId,
          endedAt: new Date()
        },
        { new: true }
      );
      if (!gameRecord) {
        this.endGame(roomCode);
        return;
      }
    }

    try {
      ratingResult = await this.leaderboardManager.processGameResult(
        winner.name,
        loser.name
      );
    } catch (error) {
      console.error('Error updating ratings at game over:', error);
    }

    // Save game result to database (both staked and casual games)
    try {
      if (gameRecord) {
        // Update existing game (staked or casual)
        if (gameRecord.isStaked) {
          console.log(`💎 Staked match ended. Updating game record with winner...`);
        } else {
          console.log(`🎮 Casual match ended. Updating game record with winner...`);
        }

        if (!gameRecord.isStaked) {
          gameRecord.winner = winnerRole;
          gameRecord.score = scoreObject;
          gameRecord.status = 'finished';
          gameRecord.lifecyclePhase = 'finished';
          gameRecord.resultReason = resultReason;
          gameRecord.resultProcessed = true;
          gameRecord.endedAt = new Date();
        }

        await gameRecord.save();
        console.log(`✅ Game ${roomCode} updated with winner: ${winnerRole}`);
      } else {
        // No existing record - create new casual game
        console.log(`🎮 Creating casual game record for room: ${roomCode}`);

        gameRecord = new Game({
          roomCode,
          player1: {
            name: game.players[0].name,
            rating: ratingResult ? ratingResult.winner.oldRating : 1000
          },
          player2: {
            name: game.players[1].name,
            rating: ratingResult ? ratingResult.loser.oldRating : 1000
          },
          winner: winnerRole,
          score: scoreObject,
          isStaked: false,
          status: 'finished',
          endedAt: new Date()
        });

        await gameRecord.save();
        console.log(`✅ Casual game ${roomCode} saved to database`);
      }
    } catch (error) {
      console.error('Error saving game record:', error);
      // Continue with normal game end flow even if save fails
    }

    const gameOverData = {
      roomCode,
      winner: winner.socketId,
      winnerName: winner.name,
      isStaked: gameRecord?.isStaked || false,
      resultSignature: gameRecord?.resultSignature || null,
      escrowAddress: gameRecord?.escrowAddress || null,
      chainId: gameRecord?.chainId || null,
      resultReason: gameRecord?.resultReason || resultReason,
      winnerAddress: gameRecord?.winnerAddress || null,
      stakeCurrency: gameRecord?.stakeCurrency || 'CELO',
      stakeAmount: gameRecord?.stakeAmount || null,
      ratings: ratingResult ? {
        [winner.socketId]: ratingResult.winner.newRating,
        [loser.socketId]: ratingResult.loser.newRating
      } : {},
      stats: {
        duration: Date.now() - game.startTime,
        maxSpeed: Math.max(Math.abs(game.ballVelocity.x || 0), Math.abs(game.ballVelocity.y || 0)),
        hits: game.hits || 0,
        score: game.score || [0, 0]
      },
      finalScore: game.score || [0, 0]
    };

    try {
      this.io.to(roomCode).emit('gameOver', gameOverData);

      const leaderboard = await this.leaderboardManager.getTopPlayers(10);
      emitLeaderboardUpdate(this.io, leaderboard);
    } catch (error) {
      console.error('Error broadcasting game over:', error);
    } finally {
      this.endGame(roomCode);
    }
  }

  handlePaddleMove(socket, { position }) {
    const game = this.gameManager.getGameByPlayer(socket.id);
    if (!game) return;

    const updatedGame = this.gameManager.updatePaddle(game.roomCode, socket.id, position);
    if (updatedGame) {
      this.io.to(game.roomCode).emit('gameUpdate', updatedGame);
    }
  }

  handleLeaveRoom(socket) {
    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    const roomCode = room.code;
    if (room.isStaked) {
      this.handleStakedDisconnect(socket, { intentionalLeave: true }).catch(error => {
        console.error('Failed to leave staked room:', error);
      });
      socket.leave(roomCode);
      return;
    }

    socket.leave(roomCode);

    this.io.to(roomCode).emit('opponentLeft');

    this.endGame(roomCode);

    this.roomManager.removePlayerFromRoom(socket.id);
  }

  handleSpectateGame(socket, { roomCode, spectatorName }) {
    const result = this.roomManager.addSpectator(roomCode, socket.id, spectatorName);

    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }

    socket.join(roomCode);

    const game = this.gameManager.getGame(roomCode);
    if (game) {
      socket.emit('spectateStart', game);
    }

    const spectatorCount = result.room.spectators ? result.room.spectators.size : 0;
    this.io.to(roomCode).emit('spectatorUpdate', { count: spectatorCount });
  }

  handleLeaveSpectate(socket) {
    for (const [roomCode, room] of this.roomManager.rooms.entries()) {
      if (room.spectators) {
        const wasSpectating = Array.from(room.spectators).some(s => s.socketId === socket.id);
        if (wasSpectating) {
          this.roomManager.removeSpectator(roomCode, socket.id);
          socket.leave(roomCode);

          const spectatorCount = room.spectators ? room.spectators.size : 0;
          this.io.to(roomCode).emit('spectatorUpdate', { count: spectatorCount });
          break;
        }
      }
    }
  }

  handlePauseGame(socket) {
    const game = this.gameManager.getGameByPlayer(socket.id);
    if (!game) return;

    const result = this.gameManager.pauseGame(game.roomCode, socket.id);

    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }

    const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
    const playerName = game.players[playerIndex].name;

    this.io.to(game.roomCode).emit('gamePaused', {
      pausedBy: playerName,
      pausesRemaining: result.pausesRemaining
    });

    const pauseTimeout = setTimeout(() => {
      if (this.gameManager.resumeGame(game.roomCode)) {
        this.io.to(game.roomCode).emit('gameResumed');
      }
    }, 10000);

    game.pauseTimeout = pauseTimeout;
  }

  handleForfeitGame(socket) {
    const game = this.gameManager.getGameByPlayer(socket.id);
    if (!game) return;

    const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
    const winner = game.players[1 - playerIndex];

    this.io.to(game.roomCode).emit('playerForfeited', {
      forfeitedPlayer: game.players[playerIndex].name,
      winner: winner.name
    });

    this.handleGameOver(game.roomCode, winner, game, 'forfeit');
  }

  handleRematchRequest(socket) {
    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    const playerIndex = room.host.socketId === socket.id ? 0 : 1;
    const opponent = playerIndex === 0 ? room.guest : room.host;

    if (!opponent) return;

    const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);
    if (opponentSocket) {
      opponentSocket.emit('rematchRequested', {
        from: playerIndex === 0 ? room.host.name : room.guest.name
      });
    }
  }

  handleRematchResponse(socket, { accepted }) {
    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    if (accepted) {
      this.roomManager.startGame(room.code);

      const gameState = this.gameManager.createGame(
        room.code,
        room.host,
        room.guest
      );

      this.io.to(room.code).emit('gameStart', gameState);
      this.startGameLoop(room.code);
    } else {
      this.io.to(room.code).emit('rematchDeclined');
    }
  }

  async handleDisconnect(socket) {
    this.handleLeaveSpectate(socket);

    const reservedRoom = this.roomManager.getReservedRoomBySocket(socket.id);
    if (reservedRoom) {
      this.roomManager.releaseReservation(socket.id);
      this.io.to(reservedRoom.code).emit('waitingForOpponent', {
        roomCode: reservedRoom.code
      });
      return;
    }

    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    if (room.isStaked) {
      await this.handleStakedDisconnect(socket);
      return;
    }

    const roomCode = room.code;
    this.markWaitingStakedRoomCancelled(room);

    const game = this.gameManager.getGame(roomCode);
    if (game && game.status === 'active') {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const winner = game.players[1 - playerIndex];

        this.io.to(roomCode).emit('opponentDisconnected', {
          disconnectedPlayer: game.players[playerIndex].name,
          winner: winner.name
        });

        this.handleGameOver(roomCode, winner, game);
      }
    } else {
      this.io.to(roomCode).emit('opponentDisconnected');
    }

    this.endGame(roomCode);
    this.roomManager.removePlayerFromRoom(socket.id);
  }

  async handleStakedDisconnect(socket) {
    const disconnected = this.roomManager.disconnectStakedPlayer(socket.id);
    if (!disconnected) return;

    const { room, role } = disconnected;
    const record = await Game.findOne({ roomCode: room.code, isStaked: true });
    if (!record || ['finished', 'abandoned', 'refunded'].includes(record.status)) return;

    record[`${role}Connected`] = false;
    if (!record.player2Address) {
      record.status = 'waiting';
      record.lifecyclePhase = 'waiting_for_player2';
      await record.save();
      await this.emitRoomState(record);
      return;
    }

    const remainingField = `${role}ReconnectRemainingMs`;
    const disconnectedField = `${role}DisconnectedAt`;
    const deadlineField = `${role}ReconnectDeadline`;
    const now = Date.now();
    record[remainingField] = Math.max(0, record[remainingField] ?? RECONNECT_BUDGET_MS);
    record[disconnectedField] = new Date(now);
    record[deadlineField] = new Date(now + record[remainingField]);
    record.status = 'paused';
    record.lifecyclePhase = role === 'player1' && record.player2Connected
      ? 'waiting_for_player1_return'
      : 'paused_reconnect';

    this.gameManager.disconnectPlayer(room.code, socket.id);
    const game = this.gameManager.getGame(room.code);
    if (game) {
      record.gameState = {
        score: game.score,
        paddles: game.paddles,
        hits: game.hits,
        startedAt: new Date(game.startTime)
      };
    }
    await record.save();
    this.io.to(room.code).emit('opponentReconnectPending', this.roomState(record));
    await this.emitRoomState(record);
  }

  async settleReconnectDeadlines() {
    const now = new Date();
    const records = await Game.find({
      isStaked: true,
      status: 'paused',
      lifecyclePhase: { $in: ['waiting_for_player1_return', 'paused_reconnect'] },
      resultProcessed: false,
      $or: [
        {
          player1ReconnectDeadline: { $lte: now },
          player1ReconnectRemainingMs: { $gt: 0 }
        },
        {
          player2ReconnectDeadline: { $lte: now },
          player2ReconnectRemainingMs: { $gt: 0 }
        }
      ]
    });

    for (const record of records) {
      const player1Expired = record.player1ReconnectDeadline?.getTime() <= now.getTime();
      const player2Expired = record.player2ReconnectDeadline?.getTime() <= now.getTime();

      if (player1Expired) record.player1ReconnectRemainingMs = 0;
      if (player2Expired) record.player2ReconnectRemainingMs = 0;

      if (player1Expired && player2Expired) {
        await this.abandonMatch(record);
      } else if (player1Expired && record.player2Connected) {
        await this.finishByRole(record, 'player2', 'disconnect_timeout');
      } else if (player2Expired && record.player1Connected) {
        await this.finishByRole(record, 'player1', 'disconnect_timeout');
      } else {
        await record.save();
        await this.emitRoomState(record);
      }
    }
  }

  async finishByRole(record, winnerRole, reason) {
    if (record.resultProcessed) return;
    const room = this.roomManager.getRoom(record.roomCode);
    const game = this.gameManager.getGame(record.roomCode);
    if (!room || !game) return;
    const winner = winnerRole === 'player1' ? room.host : room.guest;
    await this.handleGameOver(record.roomCode, winner, game, reason);
  }

  async abandonMatch(record) {
    const abandonmentSignature = await signatureService.signAbandonedRefund(
      record.roomCode,
      record.player1Address,
      record.player2Address,
      process.env.PONG_ESCROW_ADDRESS,
      Number(process.env.CELO_CHAIN_ID)
    );
    const claimed = await Game.findOneAndUpdate(
      {
        _id: record._id,
        resultProcessed: false,
        status: 'paused'
      },
      {
        resultProcessed: true,
        status: 'abandoned',
        lifecyclePhase: 'abandoned',
        resultReason: 'abandoned',
        abandonmentSignature,
        endedAt: new Date()
      },
      { new: true }
    );
    if (!claimed) return;
    this.io.to(claimed.roomCode).emit('matchAbandoned', {
      roomCode: claimed.roomCode,
      abandonmentSignature: claimed.abandonmentSignature
    });
    this.endGame(claimed.roomCode);
  }

  async markWaitingStakedRoomCancelled(room) {
    if (!room?.isStaked || room.status !== 'waiting') return;

    try {
      await Game.updateOne(
        {
          roomCode: room.code,
          isStaked: true,
          player2TxHash: { $in: [null, ''] },
          status: 'waiting'
        },
        {
          status: 'cancelled',
          challengeCreated: false,
          challengeAccepted: false
        }
      );
    } catch (error) {
      console.error(`Failed to mark staked room ${room.code} as cancelled:`, error);
    }
  }

  async validatePlayerIdentity(player) {
    if (!player?.name || !player?.walletAddress) {
      return { success: false, error: 'Connect your wallet and register a username first' };
    }

    const registeredPlayer = await Player.findOne({
      name: player.name,
      walletAddress: player.walletAddress.toLowerCase()
    }).lean();

    if (!registeredPlayer) {
      return { success: false, error: 'Username does not belong to this wallet' };
    }

    return { success: true, player: registeredPlayer };
  }

  endGame(roomCode) {
    if (this.gameLoops.has(roomCode)) {
      clearInterval(this.gameLoops.get(roomCode));
      this.gameLoops.delete(roomCode);
    }

    const game = this.gameManager.getGame(roomCode);
    if (game && game.pauseTimeout) {
      clearTimeout(game.pauseTimeout);
    }

    this.gameManager.endGame(roomCode);
    this.roomManager.endGame(roomCode);
  }
}

module.exports = MultiplayerHandler;
