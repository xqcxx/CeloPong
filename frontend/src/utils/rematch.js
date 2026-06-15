export const canRequestRematch = ({
  hasSession,
  opponentPresent,
  waitingForResponse,
  rematchResponded
}) => Boolean(
  hasSession &&
  opponentPresent &&
  !waitingForResponse &&
  !rematchResponded
);

export function getRematchGameState(accepted) {
  if (accepted.isStaked) {
    return {
      gameMode: accepted.role === 'player1' ? 'create-staked' : 'join',
      roomCode: accepted.roomCode
    };
  }
  return {
    gameMode: 'rematch',
    rematchSessionId: accepted.rematchSessionId,
    rematchToken: accepted.rematchToken,
    roomCode: accepted.roomCode
  };
}
