/* global BigInt */
import { formatUnits } from 'viem';

export const REWARD_STATUS_LABELS = {
  available: 'Available to request',
  requested: 'Payout requested',
  approved: 'Ready to withdraw',
  claimed: 'Claimed'
};

export function formatRewardAmount(amountWei, decimals = 18) {
  try {
    return formatUnits(BigInt(amountWei), decimals);
  } catch {
    return '0';
  }
}

export function formatWeekLabel(weekKey) {
  if (!weekKey) return 'Unknown week';
  const match = /^([0-9]{4})-W([0-9]{2})$/.exec(weekKey);
  return match ? `Week ${match[2]}, ${match[1]}` : weekKey;
}

export function isEligibleLeaderboardRow(row, minGames) {
  return Boolean(row && row.wins > 0 && row.gamesPlayed >= minGames);
}

export function getRewardStatusLabel(status) {
  return REWARD_STATUS_LABELS[status] || status;
}
