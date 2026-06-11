// Weighted random utilities

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maybe(skipProbability) {
  return Math.random() > skipProbability;
}

function pickWinner() {
  return Math.random() > 0.5 ? 'player1' : 'player2';
}

function roomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = { shuffle, maybe, pickWinner, roomCode };
