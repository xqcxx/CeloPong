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
