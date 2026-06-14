const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { buildResultHash, RESULT_REASON_CODES } = require('../src/services/signatureService');

const result = {
  chainId: 42220,
  contractAddress: '0xfE835aE567333F7a9284C3Faa11620B04318Ee09',
  roomCode: 'ROOM42',
  player1Address: '0x348EA77e0794633789f831098EE26Cbb7f49FcC7',
  player2Address: '0x2e9c946df3664ff46148ca1c99920aed91d18165',
  winnerAddress: '0x348EA77e0794633789f831098EE26Cbb7f49FcC7',
  score1: 5,
  score2: 3,
  resultReason: 'score'
};

test('result proof matches Solidity ABI encoding and recovers the signer', async () => {
  const wallet = ethers.Wallet.createRandom();
  const hash = buildResultHash(result);
  const expected = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'string', 'string', 'address', 'address', 'address', 'uint8', 'uint8', 'uint8'],
    [
      42220n,
      ethers.getAddress(result.contractAddress),
      'MATCH_RESULT',
      result.roomCode,
      ethers.getAddress(result.player1Address),
      ethers.getAddress(result.player2Address),
      ethers.getAddress(result.winnerAddress),
      5,
      3,
      RESULT_REASON_CODES.score
    ]
  ));
  assert.equal(hash, expected);

  const signature = await wallet.signMessage(ethers.getBytes(hash));
  assert.equal(ethers.verifyMessage(ethers.getBytes(hash), signature), wallet.address);
});

test('result proof changes when protected result fields change', () => {
  const original = buildResultHash(result);
  for (const changed of [
    { score2: 4 },
    { winnerAddress: result.player2Address },
    { roomCode: 'OTHER' },
    { contractAddress: '0x0000000000000000000000000000000000000001' },
    { chainId: 11142220 }
  ]) {
    assert.notEqual(buildResultHash({ ...result, ...changed }), original);
  }
});

test('unsupported result reasons are rejected', () => {
  assert.throws(
    () => buildResultHash({ ...result, resultReason: 'abandoned' }),
    /Unsupported result reason/
  );
});
