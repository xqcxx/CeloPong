import { readBooleanEnv } from './env';

test('readBooleanEnv falls back for undefined/null/blank', () => {
  expect(readBooleanEnv(undefined, true)).toBe(true);
  expect(readBooleanEnv(null, false)).toBe(false);
  expect(readBooleanEnv('   ', true)).toBe(true);
});

test('readBooleanEnv treats false/0 as false, case-insensitively', () => {
  expect(readBooleanEnv('false')).toBe(false);
  expect(readBooleanEnv('FALSE')).toBe(false);
  expect(readBooleanEnv('0')).toBe(false);
  expect(readBooleanEnv('true')).toBe(true);
  expect(readBooleanEnv('1')).toBe(true);
});

test('readBooleanEnv passes real booleans through', () => {
  expect(readBooleanEnv(true)).toBe(true);
  expect(readBooleanEnv(false)).toBe(false);
});
