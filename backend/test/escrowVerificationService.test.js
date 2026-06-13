const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const escrowVerificationService = require('../src/services/escrowVerificationService');

test('fetchConfirmedStakeTransaction retries until the receipt and transaction are available', async () => {
  const originalProvider = escrowVerificationService.provider;
  const originalAttempts = escrowVerificationService.receiptRetryAttempts;
  const originalDelay = escrowVerificationService.receiptRetryDelayMs;

  let receiptCalls = 0;
  let transactionCalls = 0;

  escrowVerificationService.provider = {
    async getTransactionReceipt() {
      receiptCalls += 1;
      return receiptCalls < 3 ? null : { status: 1 };
    },
    async getTransaction() {
      transactionCalls += 1;
      return transactionCalls < 3
        ? null
        : { to: '0xb2f6b1e7a2db0f9aa9ef7167b71620991a1506fc' };
    }
  };
  escrowVerificationService.receiptRetryAttempts = 3;
  escrowVerificationService.receiptRetryDelayMs = 0;

  try {
    const result = await escrowVerificationService.fetchConfirmedStakeTransaction(
      '0x' + '1'.repeat(64)
    );

    assert.equal(result.receipt.status, 1);
    assert.equal(receiptCalls, 3);
    assert.equal(transactionCalls, 3);
  } finally {
    escrowVerificationService.provider = originalProvider;
    escrowVerificationService.receiptRetryAttempts = originalAttempts;
    escrowVerificationService.receiptRetryDelayMs = originalDelay;
  }
});

test('waitForPlayer2MatchState retries until the chain reports player 2 joined', async () => {
  const originalContract = escrowVerificationService.contract;
  const originalAttempts = escrowVerificationService.receiptRetryAttempts;
  const originalDelay = escrowVerificationService.receiptRetryDelayMs;
  const expectedPlayer = ethers.getAddress('0x2e9c946df3664ff46148ca1c99920aed91d18165');

  let calls = 0;

  escrowVerificationService.contract = {
    async getMatch() {
      calls += 1;
      if (calls < 3) {
        return {
          status: 1,
          player2: '0x0000000000000000000000000000000000000000'
        };
      }

      return {
        status: 2,
        player2: expectedPlayer
      };
    }
  };
  escrowVerificationService.receiptRetryAttempts = 3;
  escrowVerificationService.receiptRetryDelayMs = 0;

  try {
    const result = await escrowVerificationService.waitForPlayer2MatchState(
      'ROOM42',
      expectedPlayer
    );

    assert.equal(Number(result.status), 2);
    assert.equal(ethers.getAddress(result.player2), expectedPlayer);
    assert.equal(calls, 3);
  } finally {
    escrowVerificationService.contract = originalContract;
    escrowVerificationService.receiptRetryAttempts = originalAttempts;
    escrowVerificationService.receiptRetryDelayMs = originalDelay;
  }
});
