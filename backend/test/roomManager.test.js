const test = require('node:test');
const assert = require('node:assert/strict');
const RoomManager = require('../src/roomManager');

function createStakedRoom() {
  const manager = new RoomManager();
  manager.createRoomWithCode(
    'ABC123',
    { name: 'host', rating: 1000 },
    'host-socket'
  );
  return manager;
}

test('reserving a staked room does not register Player 2 as the guest', () => {
  const manager = createStakedRoom();

  const result = manager.reserveRoom(
    'ABC123',
    { name: 'guest', rating: 1000 },
    'guest-socket'
  );

  assert.equal(result.success, true);
  assert.equal(result.room.guest, null);
  assert.equal(result.room.status, 'waiting');
  assert.equal(manager.getRoomByPlayer('guest-socket'), null);
  assert.equal(manager.getReservedRoomBySocket('guest-socket').code, 'ABC123');
});

test('cancelling a pending stake releases the room for another player', () => {
  const manager = createStakedRoom();
  manager.reserveRoom('ABC123', { name: 'guest1' }, 'guest-1');

  manager.releaseReservation('guest-1');
  const secondReservation = manager.reserveRoom(
    'ABC123',
    { name: 'guest2' },
    'guest-2'
  );

  assert.equal(secondReservation.success, true);
  assert.equal(secondReservation.room.pendingGuest.socketId, 'guest-2');
});

test('a different player cannot take an active staking reservation', () => {
  const manager = createStakedRoom();
  manager.reserveRoom('ABC123', { name: 'guest1' }, 'guest-1');

  const result = manager.reserveRoom('ABC123', { name: 'guest2' }, 'guest-2');

  assert.equal(result.success, false);
  assert.match(result.error, /currently staking/);
});

test('committing a verified reservation registers the guest and readies the room', () => {
  const manager = createStakedRoom();
  manager.reserveRoom('ABC123', { name: 'guest', rating: 1000 }, 'guest-socket');

  const result = manager.commitReservedGuest('ABC123', 'guest-socket');

  assert.equal(result.success, true);
  assert.equal(result.room.guest.name, 'guest');
  assert.equal(result.room.status, 'ready');
  assert.equal(result.room.pendingGuest, null);
  assert.equal(manager.getRoomByPlayer('guest-socket').code, 'ABC123');
  assert.equal(manager.getReservedRoomBySocket('guest-socket'), null);
});

test('an expired reservation cannot be committed', () => {
  const manager = createStakedRoom();
  manager.reserveRoom('ABC123', { name: 'guest' }, 'guest-socket', -1);

  const result = manager.commitReservedGuest('ABC123', 'guest-socket');

  assert.equal(result.success, false);
  assert.match(result.error, /expired/);
  assert.equal(manager.getRoom('ABC123').guest, null);
  assert.equal(manager.getReservedRoomBySocket('guest-socket'), null);
});
