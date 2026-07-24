import {
  formatRewardAmount,
  formatWeekLabel,
  getRewardStatusLabel,
  isEligibleLeaderboardRow
} from './rewards';

test('formats weekly reward amounts and ISO week labels', () => {
  expect(formatRewardAmount('10000000000000000000')).toBe('10');
  expect(formatWeekLabel('2026-W29')).toBe('Week 29, 2026');
});

test('requires wins and the configured games threshold', () => {
  expect(isEligibleLeaderboardRow({ wins: 4, gamesPlayed: 10 }, 10)).toBe(true);
  expect(isEligibleLeaderboardRow({ wins: 0, gamesPlayed: 10 }, 10)).toBe(false);
  expect(isEligibleLeaderboardRow({ wins: 4, gamesPlayed: 9 }, 10)).toBe(false);
});

test('uses clear payout lifecycle labels', () => {
  expect(getRewardStatusLabel('available')).toBe('Available to request');
  expect(getRewardStatusLabel('approved')).toBe('Ready to withdraw');
});
