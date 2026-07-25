import { shouldResetPagination, mergePages } from './pagination';

test('shouldResetPagination resets on first-page and invalid offsets', () => {
  expect(shouldResetPagination(0)).toBe(true);
  expect(shouldResetPagination(undefined)).toBe(true);
  expect(shouldResetPagination('0')).toBe(true);
  expect(shouldResetPagination(NaN)).toBe(true);
  expect(shouldResetPagination(-5)).toBe(true);
});

test('shouldResetPagination keeps subsequent pages', () => {
  expect(shouldResetPagination(50)).toBe(false);
  expect(shouldResetPagination('100')).toBe(false);
});

test('mergePages appends without duplicating by key', () => {
  const merged = mergePages(
    [{ _id: 'a' }],
    [{ _id: 'a' }, { _id: 'b' }]
  );
  expect(merged).toEqual([{ _id: 'a' }, { _id: 'b' }]);
});

test('mergePages preserves zero-valued keys while de-duplicating them', () => {
  const merged = mergePages(
    [{ _id: 0 }],
    [{ _id: 0 }, { _id: 1 }]
  );
  expect(merged).toEqual([{ _id: 0 }, { _id: 1 }]);
});
