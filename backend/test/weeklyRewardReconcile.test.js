const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReconciledStatus } = require('../src/services/weeklyRewardService');

test('withdrawn on-chain resolves to claimed from any status', () => {
  const chain = { amount: 5n, withdrawn: true };
  assert.equal(resolveReconciledStatus('requested', chain), 'claimed');
  assert.equal(resolveReconciledStatus('approved', chain), 'claimed');
  assert.equal(resolveReconciledStatus('claimed', chain), 'claimed');
});

test('approved on-chain advances a requested row to approved', () => {
  const chain = { amount: 5n, withdrawn: false };
  assert.equal(resolveReconciledStatus('requested', chain), 'approved');
});

test('never downgrades: an approved row stays approved when chain shows unwithdrawn', () => {
  const chain = { amount: 5n, withdrawn: false };
  assert.equal(resolveReconciledStatus('approved', chain), 'approved');
});

test('no on-chain approval leaves a requested row unchanged', () => {
  const chain = { amount: 0n, withdrawn: false };
  assert.equal(resolveReconciledStatus('requested', chain), 'requested');
});

test('available row is untouched without on-chain approval', () => {
  const chain = { amount: 0n, withdrawn: false };
  assert.equal(resolveReconciledStatus('available', chain), 'available');
});
