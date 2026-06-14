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

test('verifyPlayer2Stake falls back to on-chain state and PlayerJoined event', async () => {
  const methodNames = [
    'initialize',
    'assertExpectedChain',
    'fetchConfirmedStakeTransaction',
    'waitForPlayer2MatchState',
    'findPlayerJoinedEvent'
  ];
  const originals = Object.fromEntries(
    methodNames.map((name) => [name, escrowVerificationService[name]])
  );
  const expectedPlayer = '0x2e9c946df3664ff46148ca1c99920aed91d18165';
  const submittedHash = '0x' + '1'.repeat(64);
  const canonicalHash = '0x' + '2'.repeat(64);

  escrowVerificationService.initialize = () => {};
  escrowVerificationService.assertExpectedChain = async () => ({ chainId: 42220 });
  escrowVerificationService.fetchConfirmedStakeTransaction = async () => {
    throw new Error('Staking transaction is not confirmed yet. Retry verification in a few seconds.');
  };
  escrowVerificationService.waitForPlayer2MatchState = async () => ({ status: 2 });
  escrowVerificationService.findPlayerJoinedEvent = async () => ({
    transactionHash: canonicalHash
  });

  try {
    const result = await escrowVerificationService.verifyPlayer2Stake({
      roomCode: 'ROOM42',
      txHash: submittedHash,
      playerAddress: expectedPlayer,
      chainId: 42220
    });

    assert.equal(result.player2Address, expectedPlayer);
    assert.equal(result.player2TxHash, canonicalHash);
  } finally {
    methodNames.forEach((name) => {
      escrowVerificationService[name] = originals[name];
    });
  }
});

test('assertExpectedChain reports a wallet and backend chain mismatch', async () => {
  const originalGetDiagnostics = escrowVerificationService.getChainDiagnostics;
  escrowVerificationService.getChainDiagnostics = async () => ({
    chainId: 11142220,
    expectedChainId: null,
    contractDeployed: true
  });

  try {
    await assert.rejects(
      escrowVerificationService.assertExpectedChain(42220),
      /wallet used chain 42220, but backend verifies chain 11142220/
    );
  } finally {
    escrowVerificationService.getChainDiagnostics = originalGetDiagnostics;
  }
});
