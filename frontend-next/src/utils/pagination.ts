export function mergePages(existingItems, newItems, key = '_id', options = {}) {
  // Accept partial data and avoid mutating original arrays
  const merged = Array.isArray(existingItems) ? [...existingItems] : [];
  if (!Array.isArray(newItems) || newItems.length === 0) {
    return merged;
  }

  const seen = new Set(merged.map(item => item?.[key]));

  for (const item of newItems) {
    const itemKey = item?.[key];
    if (itemKey && seen.has(itemKey)) {
      continue;
    }
    merged.push(item);
    if (itemKey) {
      seen.add(itemKey);
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn('[pagination] missing key', key, item);
    }
  }

  if (typeof options.comparator === 'function') {
    merged.sort(options.comparator);
  }

  return merged;
}

export function shouldResetPagination(offset) {
  // Interpret undefined/null/'0' as needing a reset
  const numericOffset = Number(offset);
  return !numericOffset || numericOffset === 0;
}

export function createPaginationState(limit = 50) {
  return { total: 0, limit, offset: 0, hasMore: false };
}
