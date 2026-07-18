import { computePrizeFromStake, formatWeiToEth, sumWei } from './eth';

test('computePrizeFromStake doubles the stake by default', () => {
  const { formattedStake, formattedPayout, multiplier } = computePrizeFromStake('1');
  expect(formattedStake).toBe('1');
  expect(formattedPayout).toBe('2');
  expect(multiplier).toBe(2n);
});

test('computePrizeFromStake honors whole numeric multipliers', () => {
  expect(computePrizeFromStake('1', 3).formattedPayout).toBe('3');
});

test('formatWeiToEth accepts bigint and integer-like wei, trims zeros', () => {
  expect(formatWeiToEth(10n ** 18n)).toBe('1');
  expect(formatWeiToEth('1500000000000000000')).toBe('1.5');
});

test('formatWeiToEth returns 0 for unparseable input', () => {
  expect(formatWeiToEth('not-a-number')).toBe('0');
});

test('sumWei tolerates a non-array argument', () => {
  expect(sumWei(undefined)).toBe(0n);
  expect(sumWei([1n, 2n])).toBe(3n);
});
