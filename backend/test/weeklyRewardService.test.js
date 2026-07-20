const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/models/Game');
const Player = require('../src/models/Player');
const {
  computeWeekLeaderboard,
  computeWeekWinner
} = require('../src/services/weeklyRewardService');

const WEEK_KEY = '2026-W29';
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';

function queryResult(rows) {
  return {
    select() {
      return {
        lean: async () => rows
      };
    }
  };
}

async function withRewardFixtures({ games, players }, fn) {
  const originalGameFind = Game.find;
  const originalPlayerFind = Player.find;

  Game.find = () => queryResult(games);
  Player.find = () => queryResult(players);

  try {
    await fn();
  } finally {
    Game.find = originalGameFind;
    Player.find = originalPlayerFind;
  }
}

function finishedGame({
  player1Name = 'Alice',
  player2Name = 'Bob',
  player1Address = ALICE,
  player2Address = BOB,
  winner = 'player1',
  endedAt
}) {
  return {
    player1: { name: player1Name, rating: 1000 },
    player2: { name: player2Name, rating: 1000 },
    player1Address,
    player2Address,
    winner,
    endedAt: new Date(endedAt)
  };
}

test('weekly leaderboard ranks the eligible wallet with the most wins', async () => {
  const games = [];
  for (let i = 0; i < 6; i += 1) {
    games.push(finishedGame({ winner: 'player1', endedAt: `2026-07-13T0${i}:00:00Z` }));
  }
  for (let i = 0; i < 4; i += 1) {
    games.push(finishedGame({ winner: 'player2', endedAt: `2026-07-14T0${i}:00:00Z` }));
  }

  await withRewardFixtures({
    games,
    players: [
      { name: 'Alice', walletAddress: ALICE, rating: 1000 },
      { name: 'Bob', walletAddress: BOB, rating: 1000 }
    ]
  }, async () => {
    const leaderboard = await computeWeekLeaderboard(WEEK_KEY);
    assert.equal(leaderboard[0].walletAddress, ALICE);
    assert.equal(leaderboard[0].wins, 6);
    assert.equal(leaderboard[0].gamesPlayed, 10);
    assert.equal(leaderboard[0].eligible, true);

    const winner = await computeWeekWinner(WEEK_KEY);
    assert.equal(winner.walletAddress, ALICE);
  });
});

test('weekly reward tally uses game wallet addresses when player records lack wallets', async () => {
  const games = Array.from({ length: 10 }, (_, i) => finishedGame({
    winner: 'player1',
    endedAt: `2026-07-15T${String(i).padStart(2, '0')}:00:00Z`
  }));

  await withRewardFixtures({
    games,
    players: [
      { name: 'Alice', rating: 900 },
      { name: 'Bob', rating: 1000 }
    ]
  }, async () => {
    const winner = await computeWeekWinner(WEEK_KEY);
    assert.equal(winner.walletAddress, ALICE);
    assert.equal(winner.playerName, 'Alice');
  });
});

test('weekly leaderboard breaks equal wins and rating by earliest final win', async () => {
  const games = [];
  for (let i = 0; i < 10; i += 1) {
    games.push(finishedGame({ winner: 'player1', endedAt: `2026-07-13T0${i}:00:00Z` }));
  }
  for (let i = 0; i < 10; i += 1) {
    games.push(finishedGame({ winner: 'player2', endedAt: `2026-07-14T0${i}:00:00Z` }));
  }

  await withRewardFixtures({
    games,
    players: [
      { name: 'Alice', walletAddress: ALICE, rating: 1000 },
      { name: 'Bob', walletAddress: BOB, rating: 1000 }
    ]
  }, async () => {
    const leaderboard = await computeWeekLeaderboard(WEEK_KEY);
    assert.equal(leaderboard[0].walletAddress, ALICE);
    assert.equal(leaderboard[0].wins, leaderboard[1].wins);
  });
});
