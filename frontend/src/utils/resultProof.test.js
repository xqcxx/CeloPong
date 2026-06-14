import { getResultProofArgs, isLegacyMatch, RESULT_REASON_CODES } from './resultProof';
import { PONG_ESCROW_ADDRESS } from '../config/env';

const result = {
  roomCode: 'ROOM42',
  winnerAddress: '0x348EA77e0794633789f831098EE26Cbb7f49FcC7',
  finalScore: [5, 3],
  resultReason: 'score',
  resultSignature: '0xproof'
};

test('builds contract arguments from the authoritative result', () => {
  expect(getResultProofArgs(result)).toEqual([
    'ROOM42',
    result.winnerAddress,
    5,
    3,
    RESULT_REASON_CODES.score,
    '0xproof'
  ]);
});

test('rejects incomplete result proofs', () => {
  expect(() => getResultProofArgs({ ...result, resultSignature: null })).toThrow(
    'valid final-result proof'
  );
});

test('marks missing or different escrow addresses as legacy', () => {
  expect(isLegacyMatch({ isStaked: true })).toBe(true);
  expect(isLegacyMatch({
    isStaked: true,
    escrowAddress: '0x0000000000000000000000000000000000000001'
  })).toBe(true);
  expect(isLegacyMatch({ isStaked: true, escrowAddress: PONG_ESCROW_ADDRESS })).toBe(false);
  expect(isLegacyMatch({ isStaked: false })).toBe(false);
});
