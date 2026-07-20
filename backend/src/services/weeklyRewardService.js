const Game = require('../models/Game');
const Player = require('../models/Player');
const WeeklyReward = require('../models/WeeklyReward');
const { getWeekRange, getCurrentWeekKey } = require('../utils/weekUtils');
const {
  MIN_GAMES_FOR_ELIGIBILITY,
  REWARD_TOKEN_SYMBOL,
  getRewardAmountWei,
  getRewardTokenAddress
} = require('../config/weeklyRewards');
const { getApprovedReward } = require('./weeklyRewardChainService');

/**
 * Tally per-wallet wins and games-played for finished games within a week.
 * Game wallet fields are authoritative; Player records are used to enrich
 * names/ratings and as a fallback for older game rows.
 * @param {string} weekKey
 * @returns {Promise<Map<string, { walletAddress, playerName, wins, gamesPlayed, rating }>>}
 */
async function tallyWeek(weekKey) {
  const { start, end } = getWeekRange(weekKey);

  const games = await Game.find({
    status: 'finished',
    winner: { $in: ['player1', 'player2'] },
    endedAt: { $gte: start, $lt: end }
  })
    .select('player1 player2 player1Address player2Address winner endedAt')
    .lean();

  // Collect all player names appearing this week, resolve to wallets once.
  const names = new Set();
  for (const game of games) {
    if (game.player1?.name) names.add(game.player1.name);
    if (game.player2?.name) names.add(game.player2.name);
  }

  const players = await Player.find({ name: { $in: Array.from(names) } })
    .select('name walletAddress rating')
    .lean();
  const nameToPlayer = new Map();
  for (const p of players) {
    nameToPlayer.set(p.name, p);
  }

  // stats keyed by lowercased wallet address
  const stats = new Map();

  const bump = (participant, isWinner, endedAt) => {
    const name = participant?.name;
    if (!name && !participant?.walletAddress) return;
    const player = nameToPlayer.get(name);
    const walletAddress = participant?.walletAddress || player?.walletAddress;
    if (!walletAddress) return; // no payable wallet, skip

    const key = walletAddress.toLowerCase();
    let entry = stats.get(key);
    if (!entry) {
      entry = {
        walletAddress: key,
        playerName: player?.name || name || key,
        wins: 0,
        gamesPlayed: 0,
        rating: player?.rating || participant?.rating || 0,
        winTimes: []
      };
      stats.set(key, entry);
    }
    if (!entry.playerName && (player?.name || name)) {
      entry.playerName = player?.name || name;
    }
    entry.rating = Math.max(entry.rating || 0, player?.rating || participant?.rating || 0);
    entry.gamesPlayed += 1;
    if (isWinner) {
      entry.wins += 1;
      entry.winTimes.push(new Date(endedAt).getTime());
    }
  };

  for (const game of games) {
    const player1 = {
      ...game.player1,
      walletAddress: game.player1Address
    };
    const player2 = {
      ...game.player2,
      walletAddress: game.player2Address
    };
    const winner = game.winner === 'player1' ? player1 : player2;
    const loser = game.winner === 'player1' ? player2 : player1;
    bump(winner, true, game.endedAt);
    bump(loser, false, game.endedAt);
  }

  return stats;
}

/**
 * Compute the top eligible player for a completed week.
 * Eligibility: at least MIN_GAMES_FOR_ELIGIBILITY games played in the week.
 * Ranking: most wins, tie-break by higher rating, then earliest to reach the
 * final win count, then wallet address.
 * @param {string} weekKey
 * @returns {Promise<null | { walletAddress, playerName, wins, gamesPlayed, rank }>}
 */
async function computeWeekWinner(weekKey) {
  const stats = await tallyWeek(weekKey);

  const eligible = Array.from(stats.values())
    .filter((s) => s.gamesPlayed >= MIN_GAMES_FOR_ELIGIBILITY && s.wins > 0);

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.rating !== a.rating) return b.rating - a.rating;
    const aReachedAt = a.winTimes[a.wins - 1] ?? Number.MAX_SAFE_INTEGER;
    const bReachedAt = b.winTimes[b.wins - 1] ?? Number.MAX_SAFE_INTEGER;
    if (aReachedAt !== bReachedAt) return aReachedAt - bReachedAt;
    return a.walletAddress.localeCompare(b.walletAddress);
  });

  const top = eligible[0];
  return {
    walletAddress: top.walletAddress,
    playerName: top.playerName,
    wins: top.wins,
    gamesPlayed: top.gamesPlayed,
    rank: 1
  };
}

/**
 * Ranked list of eligible players for a week (for a leaderboard view).
 * @param {string} weekKey
 * @param {number} [limit]
 */
async function computeWeekLeaderboard(weekKey, limit = 10) {
  const stats = await tallyWeek(weekKey);
  return Array.from(stats.values())
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.rating !== a.rating) return b.rating - a.rating;
      const aReachedAt = a.winTimes[a.wins - 1] ?? Number.MAX_SAFE_INTEGER;
      const bReachedAt = b.winTimes[b.wins - 1] ?? Number.MAX_SAFE_INTEGER;
      if (aReachedAt !== bReachedAt) return aReachedAt - bReachedAt;
      return a.walletAddress.localeCompare(b.walletAddress);
    })
    .slice(0, limit)
    .map((s, i) => ({
      rank: i + 1,
      walletAddress: s.walletAddress,
      playerName: s.playerName,
      wins: s.wins,
      gamesPlayed: s.gamesPlayed,
      eligible: s.gamesPlayed >= MIN_GAMES_FOR_ELIGIBILITY
    }));
}

/**
 * Guard: a week must be fully completed before its reward is claimable.
 * @param {string} weekKey
 * @param {Date} [now]
 */
function isWeekCompleted(weekKey, now = new Date()) {
  const { end } = getWeekRange(weekKey);
  return now.getTime() >= end.getTime();
}

/**
 * Get or create the reward record for the winner of a completed week.
 * Returns null if the week is not yet completed or has no eligible winner.
 * The record is created in 'available' status; caller decides transitions.
 * @param {string} weekKey
 */
async function getOrCreateWeekReward(weekKey) {
  if (!isWeekCompleted(weekKey)) return null;

  const existing = await WeeklyReward.findOne({ weekKey });
  if (existing) return existing;

  const winner = await computeWeekWinner(weekKey);
  if (!winner) return null;

  try {
    return await WeeklyReward.create({
      weekKey,
      walletAddress: winner.walletAddress,
      playerName: winner.playerName,
      wins: winner.wins,
      gamesPlayed: winner.gamesPlayed,
      rank: winner.rank,
      tokenSymbol: REWARD_TOKEN_SYMBOL,
      tokenAddress: getRewardTokenAddress().toLowerCase(),
      amount: getRewardAmountWei(),
      status: 'available'
    });
  } catch (err) {
    // Unique index collision under concurrency: fetch the winning row.
    if (err.code === 11000) {
      return WeeklyReward.findOne({ weekKey });
    }
    throw err;
  }
}

/**
 * Rewards for a given wallet across recent completed weeks (materialized rows).
 * @param {string} walletAddress
 * @param {string[]} weekKeys - completed weeks to consider
 */
async function getRewardsForWallet(walletAddress, weekKeys) {
  const normalized = walletAddress.toLowerCase();

  // Ensure winner rows exist for each completed week (idempotent).
  for (const weekKey of weekKeys) {
    // eslint-disable-next-line no-await-in-loop
    await getOrCreateWeekReward(weekKey);
  }

  return WeeklyReward.find({
    walletAddress: normalized,
    weekKey: { $in: weekKeys }
  })
    .sort({ weekKey: -1 })
    .lean();
}

/**
 * Player requests payout for a week they topped. Only the winning wallet can
 * request, and only when the reward is still 'available'.
 * @param {string} weekKey
 * @param {string} walletAddress
 * @returns {Promise<WeeklyReward>}
 */
async function requestPayout(weekKey, walletAddress) {
  const normalized = walletAddress.toLowerCase();
  const reward = await getOrCreateWeekReward(weekKey);

  if (!reward) {
    throw new Error('No reward available for this week');
  }
  if (reward.walletAddress !== normalized) {
    throw new Error('Only the weekly winner may request this payout');
  }
  if (reward.status === 'claimed') {
    throw new Error('Reward already claimed');
  }
  if (reward.status === 'available') {
    reward.status = 'requested';
    reward.requestedAt = new Date();
    await reward.save();
  }
  return reward;
}

/**
 * Admin records that a reward was approved on-chain.
 * @param {string} rewardId
 * @param {string} approveTxHash
 */
async function markApproved(rewardId, approveTxHash) {
  const reward = await WeeklyReward.findById(rewardId);
  if (!reward) throw new Error('Reward not found');
  const chain = await getApprovedReward(reward.weekKey, reward.walletAddress, reward.tokenAddress);
  if (chain.withdrawn) {
    reward.status = 'claimed';
    if (!reward.claimedAt) reward.claimedAt = new Date();
    if (approveTxHash && !reward.approveTxHash) reward.approveTxHash = approveTxHash;
    await reward.save();
    return reward;
  }
  if (chain.amount < BigInt(reward.amount)) {
    throw new Error('On-chain reward approval is missing or below the expected amount');
  }
  reward.status = 'approved';
  reward.approvedAt = new Date();
  if (approveTxHash) reward.approveTxHash = approveTxHash;
  await reward.save();
  return reward;
}

/**
 * Player records that they withdrew an approved reward on-chain.
 * @param {string} weekKey
 * @param {string} walletAddress
 * @param {string} claimTxHash
 */
async function markClaimed(weekKey, walletAddress, claimTxHash) {
  const normalized = walletAddress.toLowerCase();
  const reward = await WeeklyReward.findOne({ weekKey, walletAddress: normalized });
  if (!reward) throw new Error('Reward not found');
  const chain = await getApprovedReward(reward.weekKey, reward.walletAddress, reward.tokenAddress);
  if (!chain.withdrawn) {
    throw new Error('On-chain reward withdrawal has not been confirmed');
  }
  reward.status = 'claimed';
  reward.claimedAt = new Date();
  if (claimTxHash) reward.claimTxHash = claimTxHash;
  await reward.save();
  return reward;
}

/**
 * Admin view: all rewards that need attention (requested or approved but not
 * yet claimed), newest week first.
 */
async function getPendingRewards() {
  return WeeklyReward.find({ status: { $in: ['requested', 'approved'] } })
    .sort({ weekKey: -1 })
    .lean();
}

/**
 * Map on-chain reward state to the DB status it implies. Status only advances
 * along available → requested → approved → claimed; on-chain truth never
 * downgrades a row (a chain read lagging behind a local write must not undo it).
 *
 *   withdrawn == true       → 'claimed'
 *   amount > 0 && !withdrawn → 'approved' (only from 'requested')
 *   otherwise               → unchanged
 *
 * @param {string} currentStatus
 * @param {{ amount: bigint, withdrawn: boolean }} chain
 * @returns {string} the resolved status
 */
function resolveReconciledStatus(currentStatus, chain) {
  if (chain.withdrawn) return 'claimed';
  if (chain.amount > 0n && currentStatus === 'requested') return 'approved';
  return currentStatus;
}

/**
 * Re-sync DB reward status from on-chain truth via getApprovedReward. This
 * closes the gap when an on-chain tx succeeds but the follow-up API write did
 * not (e.g. approve tx mined but /approved POST timed out, so the row is still
 * 'requested'; or a withdrawal landed but /claimed never recorded).
 *
 * Reads never mutate the chain, so this is safe to call repeatedly.
 *
 * @param {object} [options]
 * @param {string[]} [options.statuses] - which DB statuses to reconcile
 * @returns {Promise<{ scanned: number, updated: Array }>}
 */
async function reconcilePendingRewards({ statuses = ['requested', 'approved'] } = {}) {
  const rewards = await WeeklyReward.find({ status: { $in: statuses } });
  const updated = [];

  for (const reward of rewards) {
    let chain;
    try {
      // eslint-disable-next-line no-await-in-loop
      chain = await getApprovedReward(reward.weekKey, reward.walletAddress, reward.tokenAddress);
    } catch (err) {
      console.error(`Reconcile failed for reward ${reward._id} (${reward.weekKey}):`, err.message);
      continue;
    }

    const newStatus = resolveReconciledStatus(reward.status, chain);

    if (newStatus !== reward.status) {
      const from = reward.status;
      reward.status = newStatus;
      if (newStatus === 'approved' && !reward.approvedAt) reward.approvedAt = new Date();
      if (newStatus === 'claimed' && !reward.claimedAt) reward.claimedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await reward.save();
      updated.push({ rewardId: String(reward._id), weekKey: reward.weekKey, from, to: newStatus });
    }
  }

  return { scanned: rewards.length, updated };
}

module.exports = {
  tallyWeek,
  computeWeekWinner,
  computeWeekLeaderboard,
  isWeekCompleted,
  getOrCreateWeekReward,
  getRewardsForWallet,
  requestPayout,
  markApproved,
  markClaimed,
  getPendingRewards,
  reconcilePendingRewards,
  resolveReconciledStatus,
  getCurrentWeekKey
};
