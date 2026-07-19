// ISO-week helpers (Mon 00:00 UTC → next Mon 00:00 UTC).
// A canonical weekKey looks like "2026-W29".

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * ISO week-year and week number for a given date (UTC).
 * @param {Date} date
 * @returns {{ year: number, week: number }}
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO: Monday = 0 ... Sunday = 6
  const dayNum = (d.getUTCDay() + 6) % 7;
  // Shift to the Thursday of this week — its year is the ISO week-year.
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / MS_PER_WEEK);
  return { year: isoYear, week };
}

/**
 * Canonical weekKey string for a date, e.g. "2026-W29".
 * @param {Date} date
 * @returns {string}
 */
function getWeekKey(date) {
  const { year, week } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Parse a weekKey back into { year, week }.
 * @param {string} weekKey
 * @returns {{ year: number, week: number }}
 */
function parseWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error(`Invalid weekKey: ${weekKey}`);
  return { year: Number(match[1]), week: Number(match[2]) };
}

/**
 * UTC date range [start, end) for a weekKey (Monday to next Monday).
 * @param {string} weekKey
 * @returns {{ start: Date, end: Date }}
 */
function getWeekRange(weekKey) {
  const { year, week } = parseWeekKey(weekKey);
  // Monday of ISO week 1 is the Monday of the week containing Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const end = new Date(start.getTime() + MS_PER_WEEK);
  return { start, end };
}

/**
 * The weekKey for the week currently in progress (UTC now).
 * @param {Date} [now]
 * @returns {string}
 */
function getCurrentWeekKey(now = new Date()) {
  return getWeekKey(now);
}

/**
 * The last `count` completed weekKeys (most recent first), excluding the
 * in-progress week.
 * @param {number} count
 * @param {Date} [now]
 * @returns {string[]}
 */
function getRecentCompletedWeekKeys(count, now = new Date()) {
  const keys = [];
  // Step back one week at a time from the start of the current week.
  const currentRange = getWeekRange(getCurrentWeekKey(now));
  let cursor = new Date(currentRange.start.getTime() - 1); // last ms of previous week
  for (let i = 0; i < count; i += 1) {
    const key = getWeekKey(cursor);
    keys.push(key);
    const range = getWeekRange(key);
    cursor = new Date(range.start.getTime() - 1);
  }
  return keys;
}

module.exports = {
  getISOWeek,
  getWeekKey,
  parseWeekKey,
  getWeekRange,
  getCurrentWeekKey,
  getRecentCompletedWeekKeys
};
