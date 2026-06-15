class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.pendingPlayerRooms = new Map();
    this.walletRooms = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  createRoom(hostPlayer, hostSocketId) {
    const roomCode = this.generateRoomCode();

    if (this.rooms.has(roomCode)) {
      return this.createRoom(hostPlayer, hostSocketId);
    }

    this.rooms.set(roomCode, {
      code: roomCode,
      host: {
        ...hostPlayer,
        socketId: hostSocketId,
        connected: true
      },
      guest: null,
      pendingGuest: null,
      isStaked: false,
      spectators: new Set(),
      status: 'waiting',
      createdAt: Date.now()
    });

    this.playerRooms.set(hostSocketId, roomCode);

    return roomCode;
  }

  createRoomWithCode(roomCode, hostPlayer, hostSocketId) {
    if (this.rooms.has(roomCode)) {
      throw new Error('Room code already exists');
    }

    this.rooms.set(roomCode, {
      code: roomCode,
      host: {
        ...hostPlayer,
        socketId: hostSocketId,
        connected: true
      },
      guest: null,
      pendingGuest: null,
      isStaked: true,
      spectators: new Set(),
      status: 'waiting',
      createdAt: Date.now()
    });

    this.playerRooms.set(hostSocketId, roomCode);
    if (hostPlayer.walletAddress) {
      this.walletRooms.set(hostPlayer.walletAddress.toLowerCase(), roomCode);
    }

    return roomCode;
  }

  createCasualRoomWithCode(roomCode, hostPlayer, hostSocketId) {
    if (this.rooms.has(roomCode)) {
      throw new Error('Room code already exists');
    }

    this.rooms.set(roomCode, {
      code: roomCode,
      host: {
        ...hostPlayer,
        socketId: hostSocketId,
        connected: true
      },
      guest: null,
      pendingGuest: null,
      isStaked: false,
      spectators: new Set(),
      status: 'waiting',
      createdAt: Date.now()
    });
    this.playerRooms.set(hostSocketId, roomCode);
    return roomCode;
  }

  restoreStakedRoom(gameRecord) {
    const roomCode = gameRecord.roomCode;
    const room = {
      code: roomCode,
      host: {
        name: gameRecord.player1?.name,
        rating: gameRecord.player1?.rating,
        walletAddress: gameRecord.player1Address,
        socketId: null,
        connected: false
      },
      guest: gameRecord.player2Address ? {
        name: gameRecord.player2?.name,
        rating: gameRecord.player2?.rating,
        walletAddress: gameRecord.player2Address,
        socketId: null,
        connected: false
      } : null,
      pendingGuest: null,
      isStaked: true,
      spectators: new Set(),
      status: gameRecord.player2Address ? 'ready' : 'waiting',
      createdAt: gameRecord.joinDeadline?.getTime?.()
        ? gameRecord.joinDeadline.getTime() - (10 * 60 * 1000)
        : gameRecord.createdAt?.getTime?.() || Date.now()
    };

    this.rooms.set(roomCode, room);
    this.walletRooms.set(gameRecord.player1Address.toLowerCase(), roomCode);
    if (gameRecord.player2Address) {
      this.walletRooms.set(gameRecord.player2Address.toLowerCase(), roomCode);
    }
    return room;
  }

  reconnectPlayer(roomCode, walletAddress, socketId, player) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.isStaked) {
      return { success: false, error: 'Staked room not found' };
    }

    const normalized = walletAddress.toLowerCase();
    const role = room.host?.walletAddress?.toLowerCase() === normalized
      ? 'host'
      : room.guest?.walletAddress?.toLowerCase() === normalized
        ? 'guest'
        : null;
    if (!role) {
      return { success: false, error: 'Wallet is not a participant in this room' };
    }

    const slot = room[role];
    if (slot.socketId) {
      this.playerRooms.delete(slot.socketId);
    }
    room[role] = {
      ...slot,
      ...player,
      walletAddress: normalized,
      socketId,
      connected: true
    };
    this.playerRooms.set(socketId, roomCode);
    this.walletRooms.set(normalized, roomCode);
    return { success: true, room, role: role === 'host' ? 'player1' : 'player2' };
  }

  disconnectStakedPlayer(socketId) {
    const room = this.getRoomByPlayer(socketId);
    if (!room?.isStaked) return null;

    const role = room.host?.socketId === socketId
      ? 'host'
      : room.guest?.socketId === socketId
        ? 'guest'
        : null;
    if (!role) return null;

    room[role].socketId = null;
    room[role].connected = false;
    this.playerRooms.delete(socketId);
    return { room, role: role === 'host' ? 'player1' : 'player2' };
  }

  joinRoom(roomCode, guestPlayer, guestSocketId) {
    const room = this.rooms.get(roomCode);

    const validation = this.validateJoin(room);
    if (!validation.success) return validation;

    room.guest = {
      ...guestPlayer,
      socketId: guestSocketId,
      connected: true
    };
    room.status = 'ready';
    room.pendingGuest = null;

    this.playerRooms.set(guestSocketId, roomCode);
    if (guestPlayer.walletAddress) {
      this.walletRooms.set(guestPlayer.walletAddress.toLowerCase(), roomCode);
    }
    this.pendingPlayerRooms.delete(guestSocketId);

    return { success: true, room };
  }

  validateJoin(room) {
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (room.status !== 'waiting') {
      return { success: false, error: 'Room is not available' };
    }
    if (room.guest) {
      return { success: false, error: 'Room is full' };
    }
    return { success: true, room };
  }

  reserveRoom(roomCode, guestPlayer, guestSocketId, ttlMs = 300000) {
    const room = this.rooms.get(roomCode);
    const validation = this.validateJoin(room);
    if (!validation.success) return validation;

    if (room.pendingGuest && room.pendingGuest.expiresAt > Date.now()) {
      if (room.pendingGuest.socketId === guestSocketId) {
        return { success: true, room };
      }
      return { success: false, error: 'Another player is currently staking for this room' };
    }

    if (room.pendingGuest) {
      this.pendingPlayerRooms.delete(room.pendingGuest.socketId);
    }

    room.pendingGuest = {
      ...guestPlayer,
      socketId: guestSocketId,
      expiresAt: Date.now() + ttlMs
    };
    this.pendingPlayerRooms.set(guestSocketId, roomCode);

    return { success: true, room };
  }

  commitReservedGuest(roomCode, guestSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.pendingGuest || room.pendingGuest.socketId !== guestSocketId) {
      return { success: false, error: 'Staking reservation not found or expired' };
    }

    const { expiresAt, ...guestPlayer } = room.pendingGuest;
    if (expiresAt <= Date.now()) {
      this.releaseReservation(guestSocketId);
      return { success: false, error: 'Staking reservation expired. Please join again.' };
    }

    return this.joinRoom(roomCode, guestPlayer, guestSocketId);
  }

  getReservedRoomBySocket(socketId) {
    const roomCode = this.pendingPlayerRooms.get(socketId);
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  releaseReservation(socketId) {
    const roomCode = this.pendingPlayerRooms.get(socketId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    if (room?.pendingGuest?.socketId === socketId) {
      room.pendingGuest = null;
    }
    this.pendingPlayerRooms.delete(socketId);
    return room || null;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getRoomByPlayer(socketId) {
    const roomCode = this.playerRooms.get(socketId);
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  getRoomByWallet(walletAddress) {
    if (!walletAddress) return null;
    const roomCode = this.walletRooms.get(walletAddress.toLowerCase());
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room && room.status === 'ready') {
      room.status = 'playing';
      return true;
    }
    return false;
  }

  removePlayerFromRoom(socketId) {
    const roomCode = this.playerRooms.get(socketId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (room.host.socketId === socketId) {
      this.rooms.delete(roomCode);
      if (room.guest) {
        this.playerRooms.delete(room.guest.socketId);
      }
      if (room.pendingGuest) {
        this.pendingPlayerRooms.delete(room.pendingGuest.socketId);
      }
      this.playerRooms.delete(socketId);
      return room;
    }

    if (room.guest && room.guest.socketId === socketId) {
      room.guest = null;
      room.status = 'waiting';
      this.playerRooms.delete(socketId);
      return room;
    }

    return null;
  }

  endGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.host) {
      if (room.host.socketId) this.playerRooms.delete(room.host.socketId);
      if (room.host.walletAddress) this.walletRooms.delete(room.host.walletAddress.toLowerCase());
    }
    if (room.guest) {
      if (room.guest.socketId) this.playerRooms.delete(room.guest.socketId);
      if (room.guest.walletAddress) this.walletRooms.delete(room.guest.walletAddress.toLowerCase());
    }
    if (room.pendingGuest) {
      this.pendingPlayerRooms.delete(room.pendingGuest.socketId);
    }

    this.rooms.delete(roomCode);
  }

  addSpectator(roomCode, spectatorSocketId, spectatorName) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.spectators) {
      room.spectators = new Set();
    }

    room.spectators.add({ socketId: spectatorSocketId, name: spectatorName });
    return { success: true, room };
  }

  removeSpectator(roomCode, spectatorSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.spectators) return;

    room.spectators = new Set(
      Array.from(room.spectators).filter(s => s.socketId !== spectatorSocketId)
    );
  }

  getActiveGames() {
    const activeGames = [];
    for (const [code, room] of this.rooms.entries()) {
      if (room.status === 'playing' || room.status === 'ready') {
        activeGames.push({
          roomCode: code,
          players: [room.host?.name, room.guest?.name].filter(Boolean),
          spectatorCount: room.spectators ? room.spectators.size : 0,
          status: room.status
        });
      }
    }
    return activeGames;
  }

  cleanupStaleRooms(maxAgeMs = 600000) {
    const now = Date.now();
    const removedRooms = [];
    for (const [code, room] of this.rooms.entries()) {
      if (room.pendingGuest && room.pendingGuest.expiresAt <= now) {
        this.pendingPlayerRooms.delete(room.pendingGuest.socketId);
        room.pendingGuest = null;
      }
      if (room.status === 'waiting' && now - room.createdAt > maxAgeMs) {
        removedRooms.push(room);
        if (room.isStaked) {
          this.endGame(code);
        } else {
          this.removePlayerFromRoom(room.host.socketId);
        }
      }
    }
    return removedRooms;
  }
}

module.exports = RoomManager;
