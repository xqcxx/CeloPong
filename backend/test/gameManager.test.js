const test = require('node:test');
const assert = require('node:assert/strict');
const GameManager = require('../src/gameManager');

test('returns a game-over result when either player reaches five points', () => {
  const manager = new GameManager();
  const game = manager.createGame(
    'ABC123',
    { name: 'player1', socketId: 'socket-1' },
    { name: 'player2', socketId: 'socket-2' }
  );

  game.score = [4, 0];
  game.ballPos = { x: 1.01, y: 0 };
  game.ballVelocity = { x: 1, y: 0 };

  const result = manager.updateGameState('ABC123');

  assert.equal(result.gameOver, true);
  assert.equal(result.winner.socketId, 'socket-1');
  assert.deepEqual(result.game.score, [5, 0]);
  assert.equal(result.game.status, 'finished');
});

test('restores score and resumes only after both players reconnect', () => {
  const manager = new GameManager();
  const game = manager.createGame(
    'ABC123',
    {
      name: 'player1',
      socketId: null,
      walletAddress: '0x0000000000000000000000000000000000000001',
      connected: false
    },
    {
      name: 'player2',
      socketId: null,
      walletAddress: '0x0000000000000000000000000000000000000002',
      connected: false
    },
    { score: [3, 2], hits: 7 }
  );
  game.isPaused = true;
  game.reconnectPaused = true;

  manager.reconnectPlayer(
    'ABC123',
    '0x0000000000000000000000000000000000000001',
    'socket-1'
  );
  assert.equal(manager.resumeAfterReconnect('ABC123'), false);

  manager.reconnectPlayer(
    'ABC123',
    '0x0000000000000000000000000000000000000002',
    'socket-2'
  );
  assert.equal(manager.resumeAfterReconnect('ABC123'), true);
  assert.deepEqual(game.score, [3, 2]);
  assert.equal(game.hits, 7);
  assert.equal(game.isPaused, false);
});

test('a paused active game remains resumable', () => {
  const manager = new GameManager();
  const game = manager.createGame(
    'PAUSE1',
    { name: 'one', socketId: 'socket-1', walletAddress: '0x1' },
    { name: 'two', socketId: 'socket-2', walletAddress: '0x2' }
  );

  assert.equal(manager.pauseGame('PAUSE1', 'socket-1').success, true);
  assert.equal(manager.updateGameState('PAUSE1'), null);
  assert.equal(manager.getGame('PAUSE1'), game);
  assert.equal(manager.resumeGame('PAUSE1'), true);
  assert.equal(manager.updateGameState('PAUSE1'), game);
});
