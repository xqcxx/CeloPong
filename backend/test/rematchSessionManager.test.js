const test = require('node:test');
const assert = require('node:assert/strict');
const RematchSessionManager = require('../src/rematchSessionManager');

function createSession(manager) {
  return manager.createSession({
    roomCode: 'OLD123',
    players: [
      { name: 'alice', walletAddress: '0x0000000000000000000000000000000000000001' },
      { name: 'bob', walletAddress: '0x0000000000000000000000000000000000000002' }
    ],
    isStaked: false
  });
}

test('rematch is unavailable until both players join the post-game lobby', () => {
  const manager = new RematchSessionManager();
  const session = createSession(manager);
  manager.join(session.id, session.players[0].token, 'alice-socket');

  assert.equal(manager.presence(session, session.players[0]).opponentPresent, false);
  assert.match(manager.request('alice-socket').error, /no longer available/);

  manager.join(session.id, session.players[1].token, 'bob-socket');
  assert.equal(manager.presence(session, session.players[0]).opponentPresent, true);
});

test('requester becomes rematch player one and opponent must accept', () => {
  const manager = new RematchSessionManager();
  const session = createSession(manager);
  manager.join(session.id, session.players[0].token, 'alice-socket');
  manager.join(session.id, session.players[1].token, 'bob-socket');

  assert.equal(manager.request('bob-socket').success, true);
  assert.match(manager.respond('bob-socket', true).error, /own rematch/);

  const response = manager.respond('alice-socket', true);
  assert.equal(response.success, true);
  assert.equal(response.requester.name, 'bob');
  assert.equal(response.responder.name, 'alice');
  assert.equal(response.session.roomCode.length, 6);
});

test('casual rematch waits for both replacement game sockets', () => {
  const manager = new RematchSessionManager();
  const session = createSession(manager);
  manager.join(session.id, session.players[0].token, 'alice-over');
  manager.join(session.id, session.players[1].token, 'bob-over');
  manager.request('alice-over');
  manager.respond('bob-over', true);

  const first = manager.enterGame(
    session.id,
    session.players[0].token,
    'alice-game',
    { name: 'alice' }
  );
  assert.equal(first.ready, false);

  const second = manager.enterGame(
    session.id,
    session.players[1].token,
    'bob-game',
    { name: 'bob' }
  );
  assert.equal(second.ready, true);
  assert.equal(second.requester.name, 'alice');
});

test('expired sessions reject joins', () => {
  let now = 1000;
  const manager = new RematchSessionManager({ ttlMs: 50, now: () => now });
  const session = createSession(manager);
  now = 1051;

  const result = manager.join(session.id, session.players[0].token, 'socket');
  assert.equal(result.success, false);
  assert.match(result.error, /expired/);
});

test('accepted staked rematches extend the session for wallet confirmation', () => {
  let now = 1000;
  const manager = new RematchSessionManager({ ttlMs: 50, now: () => now });
  const session = manager.createSession({
    roomCode: 'OLD123',
    players: [{ name: 'alice' }, { name: 'bob' }],
    isStaked: true,
    stakeAmount: '1',
    stakeCurrency: 'CELO'
  });
  manager.join(session.id, session.players[0].token, 'alice');
  manager.join(session.id, session.players[1].token, 'bob');
  manager.request('alice');
  manager.respond('bob', true);

  now += 1000;
  assert.ok(manager.getSession(session.id));
});
