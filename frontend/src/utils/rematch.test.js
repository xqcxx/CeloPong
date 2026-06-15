import { canRequestRematch, getRematchGameState } from './rematch';

test('rematch requires a live opponent and an idle request state', () => {
  expect(canRequestRematch({
    hasSession: true,
    opponentPresent: true,
    waitingForResponse: false,
    rematchResponded: false
  })).toBe(true);
  expect(canRequestRematch({
    hasSession: true,
    opponentPresent: false,
    waitingForResponse: false,
    rematchResponded: false
  })).toBe(false);
});

test('casual rematches reconnect through the accepted session', () => {
  expect(getRematchGameState({
    isStaked: false,
    rematchSessionId: 'session',
    rematchToken: 'token',
    roomCode: 'NEW123'
  })).toEqual({
    gameMode: 'rematch',
    rematchSessionId: 'session',
    rematchToken: 'token',
    roomCode: 'NEW123'
  });
});

test('staked requester is player one and responder is player two', () => {
  expect(getRematchGameState({
    isStaked: true,
    role: 'player1',
    roomCode: 'NEW123'
  })).toEqual({ gameMode: 'create-staked', roomCode: 'NEW123' });
  expect(getRematchGameState({
    isStaked: true,
    role: 'player2',
    roomCode: 'NEW123'
  })).toEqual({ gameMode: 'join', roomCode: 'NEW123' });
});
