class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.pendingPlayerRooms = new Map();
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
        socketId: hostSocketId
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
        socketId: hostSocketId
      },
      guest: null,
      pendingGuest: null,
      isStaked: true,
      spectators: new Set(),
      status: 'waiting',
      createdAt: Date.now()
    });

    this.playerRooms.set(hostSocketId, roomCode);

    return roomCode;
  }

  joinRoom(roomCode, guestPlayer, guestSocketId) {
    const room = this.rooms.get(roomCode);

    const validation = this.validateJoin(room);
    if (!validation.success) return validation;

    room.guest = {
      ...guestPlayer,
      socketId: guestSocketId
    };
    room.status = 'ready';
    room.pendingGuest = null;

    this.playerRooms.set(guestSocketId, roomCode);
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
      this.playerRooms.delete(room.host.socketId);
    }
    if (room.guest) {
      this.playerRooms.delete(room.guest.socketId);
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
        this.removePlayerFromRoom(room.host.socketId);
      }
    }
    return removedRooms;
  }
}

module.exports = RoomManager;
