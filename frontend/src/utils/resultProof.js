import { PONG_ESCROW_ADDRESS } from '../config/env';

export const RESULT_REASON_CODES = Object.freeze({
  score: 0,
  forfeit: 1,
  disconnect_timeout: 2,
});

export const addressesMatch = (first, second) =>
  Boolean(first && second && first.toLowerCase() === second.toLowerCase());

export const isLegacyMatch = (game) =>
  Boolean(
    game?.isStaked &&
    (!game.escrowAddress || !addressesMatch(game.escrowAddress, PONG_ESCROW_ADDRESS))
  );

export function getResultProofArgs(result) {
  const reason = RESULT_REASON_CODES[result?.resultReason];
  if (
    !result?.roomCode ||
    !result?.winnerAddress ||
    !Array.isArray(result?.finalScore) ||
    reason === undefined ||
    !result?.resultSignature
  ) {
    throw new Error('This match does not have a valid final-result proof.');
  }

  return [
    result.roomCode,
    result.winnerAddress,
    Number(result.finalScore[0]),
    Number(result.finalScore[1]),
    reason,
    result.resultSignature,
  ];
}
