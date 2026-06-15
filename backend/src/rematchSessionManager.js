const crypto = require('crypto');

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const STAKED_ACCEPTED_TTL_MS = 10 * 60 * 1000;

class RematchSessionManager {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.sessions = new Map();
    this.socketSessions = new Map();
  }

  createSession({ roomCode, players, isStaked, stakeAmount, stakeCurrency }) {
    const id = crypto.randomUUID();
    const participants = players.map((player, index) => ({
      id: index === 0 ? 'player1' : 'player2',
      name: player.name,
      walletAddress: player.walletAddress?.toLowerCase() || null,
      token: crypto.randomBytes(24).toString('hex'),
      socketId: null,
      gameSocketId: null,
      playerData: null
    }));
    const session = {
      id,
      previousRoomCode: roomCode,
      players: participants,
      isStaked: Boolean(isStaked),
      stakeAmount: stakeAmount || null,
      stakeCurrency: stakeCurrency || 'CELO',
      requesterId: null,
      accepted: false,
      stakeReady: false,
      roomCode: null,
      expiresAt: this.now() + this.ttlMs
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.deleteSession(id);
      return null;
    }
    return session;
  }

  getParticipant(session, token) {
    return session?.players.find(player => player.token === token) || null;
  }

  join(id, token, socketId) {
    const session = this.getSession(id);
    const participant = this.getParticipant(session, token);
    if (!session || !participant) {
      return { success: false, error: 'Rematch session is invalid or expired' };
    }

    if (participant.socketId) this.socketSessions.delete(participant.socketId);
    participant.socketId = socketId;
    this.socketSessions.set(socketId, { sessionId: id, participantId: participant.id });
    return { success: true, session, participant };
  }

  getBySocket(socketId) {
    const membership = this.socketSessions.get(socketId);
    if (!membership) return null;
    const session = this.getSession(membership.sessionId);
    if (!session) return null;
    const participant = session.players.find(player => player.id === membership.participantId);
    return participant ? { session, participant } : null;
  }

  disconnect(socketId) {
    const membership = this.socketSessions.get(socketId);
    if (!membership) return null;
    this.socketSessions.delete(socketId);
    const session = this.getSession(membership.sessionId);
    const participant = session?.players.find(player => player.id === membership.participantId);
    if (participant?.socketId === socketId) participant.socketId = null;
    if (participant?.gameSocketId === socketId) participant.gameSocketId = null;
    return session ? { session, participant } : null;
  }

  presence(session, participant) {
    const opponent = session.players.find(player => player.id !== participant.id);
    return {
      opponentPresent: Boolean(opponent?.socketId),
      opponentName: opponent?.name || null,
      expiresAt: session.expiresAt
    };
  }

  request(socketId) {
    const membership = this.getBySocket(socketId);
    if (!membership) return { success: false, error: 'Join the rematch lobby first' };
    const { session, participant } = membership;
    const opponent = session.players.find(player => player.id !== participant.id);
    if (!opponent?.socketId) return { success: false, error: 'Opponent is no longer available' };
    if (session.requesterId && session.requesterId !== participant.id) {
      return { success: false, error: 'Opponent already requested a rematch' };
    }
    session.requesterId = participant.id;
    return { success: true, session, requester: participant, opponent };
  }

  respond(socketId, accepted) {
    const membership = this.getBySocket(socketId);
    if (!membership) return { success: false, error: 'Join the rematch lobby first' };
    const { session, participant } = membership;
    if (!session.requesterId) return { success: false, error: 'No rematch request is pending' };
    if (session.requesterId === participant.id) {
      return { success: false, error: 'The requester cannot answer their own rematch' };
    }

    const requester = session.players.find(player => player.id === session.requesterId);
    if (!accepted) {
      session.requesterId = null;
      return { success: true, accepted: false, session, requester, responder: participant };
    }

    session.accepted = true;
    if (session.isStaked) {
      session.expiresAt = this.now() + STAKED_ACCEPTED_TTL_MS;
    }
    session.roomCode ||= this.generateRoomCode();
    return { success: true, accepted: true, session, requester, responder: participant };
  }

  enterGame(id, token, socketId, playerData) {
    const session = this.getSession(id);
    const participant = this.getParticipant(session, token);
    if (!session || !participant || !session.accepted || session.isStaked) {
      return { success: false, error: 'Rematch is not ready' };
    }
    participant.gameSocketId = socketId;
    participant.playerData = playerData;
    this.socketSessions.set(socketId, { sessionId: id, participantId: participant.id });
    const requester = session.players.find(player => player.id === session.requesterId);
    const responder = session.players.find(player => player.id !== session.requesterId);
    return {
      success: true,
      session,
      ready: Boolean(requester?.gameSocketId && responder?.gameSocketId),
      requester,
      responder
    };
  }

  getClientData(session, participant) {
    return {
      rematchSessionId: session.id,
      rematchToken: participant.token,
      expiresAt: session.expiresAt
    };
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  deleteSession(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    for (const player of session.players) {
      if (player.socketId) this.socketSessions.delete(player.socketId);
      if (player.gameSocketId) this.socketSessions.delete(player.gameSocketId);
    }
    this.sessions.delete(id);
  }
}

module.exports = RematchSessionManager;
