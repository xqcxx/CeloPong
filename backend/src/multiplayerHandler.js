const RoomManager = require('./roomManager');
const GameManager = require('./gameManager');
const LeaderboardManager = require('./leaderboardManager');
const Game = require('./models/Game');
const signatureService = require('./services/signatureService');
const emitLeaderboardUpdate = require('./utils/emitLeaderboardUpdate');

class MultiplayerHandler {
  constructor(io) {
    this.io = io;
    this.roomManager = new RoomManager();
    this.gameManager = new GameManager();
    this.leaderboardManager = new LeaderboardManager();
    this.gameLoops = new Map();

    setInterval(() => {
      this.roomManager.cleanupStaleRooms();
    }, 60000);
  }

  handleConnection(socket) {
    const username = socket.handshake.query.username;

    socket.on('createRoom', (player, roomCode) => {
      this.handleCreateRoom(socket, player, roomCode);
    });

    socket.on('joinRoom', (data) => {
      this.handleJoinRoom(socket, data);
    });

    socket.on('findRandomMatch', (player) => {
      this.handleFindRandomMatch(socket, player);
    });

    socket.on('player2StakeCompleted', (data) => {
      this.handlePlayer2StakeCompleted(socket, data);
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
      this.handleDisconnect(socket);
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

  handleCreateRoom(socket, player, providedRoomCode) {
    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      socket.emit('error', { message: 'Already in a room' });
      return;
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
  }

  async handleJoinRoom(socket, { roomCode, player }) {
    console.log(`🔵 handleJoinRoom called - Room: ${roomCode}, Player: ${player?.name}, Socket: ${socket.id}`);

    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      console.log(`❌ Player ${socket.id} already in room ${existingRoom.code}`);
      socket.emit('error', { message: 'Already in a room' });
      return;
    }

    const result = this.roomManager.joinRoom(roomCode, player, socket.id);

    if (!result.success) {
      console.log(`❌ Failed to join room ${roomCode}: ${result.error}`);
      socket.emit('error', { message: result.error });
      return;
    }

    console.log(`✅ Player ${player?.name} joined room ${roomCode}`);
    socket.join(roomCode);

    // Check if this is a staked match
    try {
      console.log(`📡 Checking for staked match in database: ${roomCode}`);
      const gameRecord = await Game.findOne({ roomCode });

      if (gameRecord) {
        console.log(`📊 Game record:`, JSON.stringify(gameRecord, null, 2));

        if (gameRecord.isStaked && !gameRecord.player2TxHash) {
          // This is a staked match and Player 2 hasn't staked yet
          console.log(`💎 Staked match detected! Prompting Player 2 to stake ${gameRecord.stakeAmount} ${gameRecord.stakeCurrency || 'CELO'}`);
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

          console.log(`⏳ Waiting for Player 2 to stake...`);
          return; // Don't start game yet
        } else {
          console.log(`ℹ️  Not a staked match or Player 2 already staked. isStaked: ${gameRecord.isStaked}, player2TxHash: ${gameRecord.player2TxHash}`);
        }
      } else {
        console.log(`ℹ️  No game record found - proceeding with normal match`);
      }
    } catch (error) {
      console.error('❌ Error checking for staked match:', error);
      // Continue with normal game start if check fails
    }

    console.log(`🎮 Starting normal game for room ${roomCode}`);
    this.io.to(roomCode).emit('roomReady', {
      room: result.room
    });

    this.startGame(roomCode);
  }

  handlePlayer2StakeCompleted(socket, { roomCode }) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    console.log('Player 2 staking completed for room:', roomCode);

    this.io.to(roomCode).emit('roomReady', { room });

    this.startGame(roomCode);
  }

  handleFindRandomMatch(socket, player) {
    const existingRoom = this.roomManager.getRoomByPlayer(socket.id);
    if (existingRoom) {
      socket.emit('error', { message: 'Already in a room' });
      return;
    }

    const availableRooms = Array.from(this.roomManager.rooms.values())
      .filter(room => room.status === 'waiting' && !room.guest);

    if (availableRooms.length > 0) {
      const room = availableRooms[0];
      this.handleJoinRoom(socket, { roomCode: room.code, player });
    } else {
      const roomCode = this.roomManager.createRoom(player, socket.id);
      socket.join(roomCode);
      socket.emit('waitingForOpponent', { roomCode });
    }
  }

  startGame(roomCode) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room || room.status !== 'ready') return;

    this.roomManager.startGame(roomCode);

    const gameState = this.gameManager.createGame(
      roomCode,
      room.host,
      room.guest
    );

    this.io.to(roomCode).emit('gameStart', gameState);

    this.startGameLoop(roomCode);
  }

  startGameLoop(roomCode) {
    if (this.gameLoops.has(roomCode)) {
      clearInterval(this.gameLoops.get(roomCode));
    }

    const interval = setInterval(() => {
      const result = this.gameManager.updateGameState(roomCode);

      if (!result) {
        clearInterval(interval);
        this.gameLoops.delete(roomCode);
        return;
      }

      if (result.gameOver) {
        this.handleGameOver(roomCode, result.winner, result.game);
        clearInterval(interval);
        this.gameLoops.delete(roomCode);
        return;
      }

      this.io.to(roomCode).emit('gameUpdate', result);
    }, 1000 / 60);

    this.gameLoops.set(roomCode, interval);
  }

  async handleGameOver(roomCode, winner, game) {
    const loser = game.players.find(p => p.socketId !== winner.socketId);

    if (!winner || !loser) {
      this.endGame(roomCode);
      return;
    }

    const ratingResult = await this.leaderboardManager.processGameResult(
      winner.name,
      loser.name
    );

    // Save game result to database (both staked and casual games)
    try {
      // Determine which player won (player1 or player2)
      const winnerRole = game.players[0].socketId === winner.socketId ? 'player1' : 'player2';

      // Check if game record already exists
      let gameRecord = await Game.findOne({ roomCode });

      // Convert score array to object if needed
      const scoreObject = game.score ? { player1: game.score[0], player2: game.score[1] } : { player1: 0, player2: 0 };

      if (gameRecord) {
        // Update existing game (staked or casual)
        if (gameRecord.isStaked) {
          console.log(`💎 Staked match ended. Updating game record with winner...`);
        } else {
          console.log(`🎮 Casual match ended. Updating game record with winner...`);
        }

        gameRecord.winner = winnerRole;
        gameRecord.score = scoreObject;
        gameRecord.status = 'finished';
        gameRecord.endedAt = new Date();
        gameRecord.winnerAddress = winnerRole === 'player1' ? gameRecord.player1Address : gameRecord.player2Address;

        // Generate signature if staked and not already generated
        if (gameRecord.isStaked && gameRecord.winnerAddress && !gameRecord.winnerSignature) {
          if (signatureService.isReady()) {
            try {
              const signature = await signatureService.signWinner(
                roomCode,
                gameRecord.winnerAddress,
                gameRecord.stakeAmount
              );
              gameRecord.winnerSignature = signature;
              console.log(`✅ Winner signature generated for room: ${roomCode}`);
              console.log(`🔐 Winner signature:`, signature.slice(0, 20) + '...');
            } catch (error) {
              console.error('❌ Failed to generate signature:', error);
            }
          } else {
            console.warn('⚠️  Signature service not ready, skipping signature generation');
          }
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
      winner: winner.socketId,
      winnerName: winner.name,
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

    this.io.to(roomCode).emit('gameOver', gameOverData);

    const leaderboard = await this.leaderboardManager.getTopPlayers(10);
    emitLeaderboardUpdate(this.io, leaderboard);

    this.endGame(roomCode);
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

  handleDisconnect(socket) {
    this.handleLeaveSpectate(socket);

    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    const roomCode = room.code;

    this.io.to(roomCode).emit('opponentDisconnected');

    this.endGame(roomCode);

    this.roomManager.removePlayerFromRoom(socket.id);
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
      this.gameManager.resumeGame(game.roomCode);
      this.io.to(game.roomCode).emit('gameResumed');
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

    this.handleGameOver(game.roomCode, winner, game);
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

  handleDisconnect(socket) {
    this.handleLeaveSpectate(socket);

    const room = this.roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    const roomCode = room.code;

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
