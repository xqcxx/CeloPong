const assert = require('assert');
const { getCorsOrigins } = require('../src/utils/corsOrigins');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test('keeps configured frontend origin while retaining known production origins', () => {
  const result = getCorsOrigins('https://frontend-next-three-gilt.vercel.app');

  assert.strictEqual(result.source, 'combined');
  assert.ok(result.origins.includes('https://frontend-next-three-gilt.vercel.app'));
  assert.ok(result.origins.includes('https://frontend-rosy-iota-16.vercel.app'));
  assert.ok(result.origins.includes('http://localhost:3000'));
});

test('supports comma-separated configured origins without duplicates', () => {
  const result = getCorsOrigins(
    'https://frontend-next-three-gilt.vercel.app,https://frontend-rosy-iota-16.vercel.app'
  );

  const occurrences = result.origins.filter((origin) => origin === 'https://frontend-rosy-iota-16.vercel.app').length;
  assert.strictEqual(occurrences, 1);
});
