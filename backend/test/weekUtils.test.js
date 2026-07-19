const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getISOWeek,
  getWeekKey,
  parseWeekKey,
  getWeekRange,
  getRecentCompletedWeekKeys
} = require('../src/utils/weekUtils');

test('getISOWeek matches known ISO week boundaries', () => {
  // 2026-01-01 is a Thursday → ISO week 1 of 2026.
  assert.deepEqual(getISOWeek(new Date('2026-01-01T12:00:00Z')), { year: 2026, week: 1 });
  // 2026-07-13 is a Monday in ISO week 29.
  assert.deepEqual(getISOWeek(new Date('2026-07-13T00:00:00Z')), { year: 2026, week: 29 });
  // 2021-01-01 is a Friday → belongs to ISO week 53 of 2020.
  assert.deepEqual(getISOWeek(new Date('2021-01-01T12:00:00Z')), { year: 2020, week: 53 });
});

test('getWeekKey formats with zero-padded week number', () => {
  assert.equal(getWeekKey(new Date('2026-01-01T12:00:00Z')), '2026-W01');
  assert.equal(getWeekKey(new Date('2026-07-13T00:00:00Z')), '2026-W29');
});

test('parseWeekKey round-trips and rejects garbage', () => {
  assert.deepEqual(parseWeekKey('2026-W29'), { year: 2026, week: 29 });
  assert.throws(() => parseWeekKey('2026-29'));
  assert.throws(() => parseWeekKey('not-a-week'));
});

test('getWeekRange returns a Monday-to-Monday UTC window', () => {
  const { start, end } = getWeekRange('2026-W29');
  // ISO week 29 of 2026 starts Monday 2026-07-13.
  assert.equal(start.toISOString(), '2026-07-13T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-07-20T00:00:00.000Z');
  // Start is a Monday (getUTCDay === 1).
  assert.equal(start.getUTCDay(), 1);
  // Exactly 7 days.
  assert.equal((end - start) / (24 * 60 * 60 * 1000), 7);
});

test('getWeekKey is consistent with getWeekRange start', () => {
  const key = '2026-W29';
  const { start } = getWeekRange(key);
  assert.equal(getWeekKey(start), key);
});

test('getRecentCompletedWeekKeys excludes the in-progress week and is descending', () => {
  // Now = Wednesday of ISO week 29, 2026.
  const now = new Date('2026-07-15T12:00:00Z');
  const keys = getRecentCompletedWeekKeys(3, now);
  assert.deepEqual(keys, ['2026-W28', '2026-W27', '2026-W26']);
});

test('getRecentCompletedWeekKeys crosses a year boundary correctly', () => {
  // Now = Friday 2026-01-02 (ISO week 1 of 2026).
  const now = new Date('2026-01-02T12:00:00Z');
  const keys = getRecentCompletedWeekKeys(2, now);
  // Previous completed weeks are the last two weeks of ISO 2025.
  assert.deepEqual(keys, ['2025-W52', '2025-W51']);
});
