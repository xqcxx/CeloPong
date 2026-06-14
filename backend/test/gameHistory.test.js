const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClaimSummary,
  buildHistoryQuery,
  toHistoryGame
} = require('../src/utils/gameHistory');

const wallet = '0x348EA77e0794633789f831098EE26Cbb7f49FcC7';
const escrow = '0x0000000000000000000000000000000000000001';

test('claim filters require wins and a valid wallet', () => {
  assert.throws(
    () => buildHistoryQuery({ playerName: 'praise', claimStatus: 'claimable' }),
    /valid wallet/
  );

  const query = buildHistoryQuery({
    playerName: 'praise',
    filter: 'wins',
    claimStatus: 'claimable',
    walletAddress: wallet,
    escrowAddress: escrow
  });
  assert.equal(query.claimed, false);
  assert.equal(query.isStaked, true);
  assert.equal(query.winnerAddress, wallet.toLowerCase());
  assert.equal(query.escrowAddress, escrow);
});

test('claim summaries are grouped by currency and ignore legacy matches', () => {
  const base = {
    isStaked: true,
    winnerAddress: wallet,
    escrowAddress: escrow,
    resultSignature: '0xproof',
    stakeAmount: '2'
  };
  const summary = buildClaimSummary([
    { ...base, stakeCurrency: 'CELO', claimed: false },
    { ...base, stakeCurrency: 'CELO', claimed: true },
    { ...base, stakeCurrency: 'cUSD', stakeAmount: '3', claimed: false },
    { ...base, escrowAddress: null, claimed: false },
    { ...base, escrowAddress: '0x0000000000000000000000000000000000000002', claimed: false }
  ], wallet, escrow);

  assert.deepEqual(summary.CELO, {
    claimable: 4,
    claimed: 4,
    total: 8,
    claimableCount: 1,
    claimedCount: 1
  });
  assert.equal(summary.cUSD.claimable, 6);
});

test('history marks old staked records as legacy', () => {
  const transformed = toHistoryGame({
    isStaked: true,
    player1: { name: 'praise' },
    player2: { name: 'rival' },
    winner: 'player1',
    score: { player1: 5, player2: 2 }
  }, 'praise', escrow);

  assert.equal(transformed.legacyMatch, true);
  assert.equal(transformed.result, 'win');
  assert.equal(transformed.finalScore, '5-2');
});
