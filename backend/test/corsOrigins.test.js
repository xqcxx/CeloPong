const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCorsOrigins,
  normalizeUrl,
  ORIGIN_SOURCES,
} = require('../src/utils/corsOrigins');

test('normalizeUrl removes repeated trailing slashes', () => {
  assert.equal(normalizeUrl('https://example.com///'), 'https://example.com');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeUrl(''), null);
});

test('getCorsOrigins preserves a normalized frontend origin', () => {
  const result = getCorsOrigins('https://frontend.example.com///');

  assert.deepEqual(result, {
    origins: ['https://frontend.example.com'],
    source: ORIGIN_SOURCES.ENV,
  });
});
