const { ethers } = require('ethers');

const CLAIM_STATUSES = new Set(['all', 'claimable', 'claimed']);

function normalizeWallet(walletAddress) {
  if (!walletAddress) return null;
  try {
    return ethers.getAddress(walletAddress).toLowerCase();
  } catch {
    return null;
  }
}

function buildHistoryQuery({
  playerName,
  filter = 'all',
  staked,
  claimStatus = 'all',
  walletAddress,
  escrowAddress
}) {
  if (!CLAIM_STATUSES.has(claimStatus)) {
    throw new Error('Invalid claim status');
  }

  const query = {
    status: 'finished',
    $or: [
      { 'player1.name': playerName },
      { 'player2.name': playerName }
    ]
  };

  if (staked !== undefined) query.isStaked = staked === 'true';

  if (filter === 'wins') {
    query.$or = [
      { 'player1.name': playerName, winner: 'player1' },
      { 'player2.name': playerName, winner: 'player2' }
    ];
  } else if (filter === 'losses') {
    query.$or = [
      { 'player1.name': playerName, winner: 'player2' },
      { 'player2.name': playerName, winner: 'player1' }
    ];
  }

  if (claimStatus !== 'all') {
    const wallet = normalizeWallet(walletAddress);
    if (filter !== 'wins' || !wallet) {
      throw new Error('A valid wallet is required for claim filters');
    }
    query.winnerAddress = wallet;
    query.isStaked = true;
    query.resultSignature = { $exists: true, $nin: [null, ''] };
    query.escrowAddress = escrowAddress?.toLowerCase() || { $exists: true, $nin: [null, ''] };
    query.claimed = claimStatus === 'claimed';
  }

  return query;
}

function buildClaimSummary(games, walletAddress, escrowAddress) {
  const wallet = normalizeWallet(walletAddress);
  const currentEscrow = escrowAddress?.toLowerCase();
  if (!wallet) return {};

  return games.reduce((summary, game) => {
    if (
      !game.isStaked ||
      game.winnerAddress?.toLowerCase() !== wallet ||
      !game.escrowAddress ||
      (currentEscrow && game.escrowAddress.toLowerCase() !== currentEscrow) ||
      !game.resultSignature
    ) {
      return summary;
    }

    const currency = game.stakeCurrency || 'CELO';
    const payout = Number(game.stakeAmount || 0) * 2;
    const group = summary[currency] || {
      claimable: 0,
      claimed: 0,
      total: 0,
      claimableCount: 0,
      claimedCount: 0
    };

    group.total += payout;
    if (game.claimed) {
      group.claimed += payout;
      group.claimedCount += 1;
    } else {
      group.claimable += payout;
      group.claimableCount += 1;
    }
    summary[currency] = group;
    return summary;
  }, {});
}

function toHistoryGame(game, playerName, escrowAddress) {
  const isPlayer1 = game.player1?.name === playerName;
  const currentEscrow = escrowAddress?.toLowerCase();
  return {
    ...game,
    legacyMatch: Boolean(
      game.isStaked &&
      (!game.escrowAddress ||
        (currentEscrow && game.escrowAddress.toLowerCase() !== currentEscrow))
    ),
    opponent: isPlayer1 ? game.player2?.name : game.player1?.name,
    result: !game.winner
      ? 'draw'
      : ((isPlayer1 && game.winner === 'player1') || (!isPlayer1 && game.winner === 'player2')
        ? 'win'
        : 'loss'),
    finalScore: game.score
      ? `${isPlayer1 ? game.score.player1 : game.score.player2}-${isPlayer1 ? game.score.player2 : game.score.player1}`
      : 'N/A'
  };
}

module.exports = {
  buildClaimSummary,
  buildHistoryQuery,
  normalizeWallet,
  toHistoryGame
};
