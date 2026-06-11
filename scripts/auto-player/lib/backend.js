const config = require('./config');

async function createGame(data) {
  const res = await fetch(`${config.BACKEND_URL}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function getGame(roomCode) {
  const res = await fetch(`${config.BACKEND_URL}/games/${roomCode}`);
  return res.json();
}

async function updatePlayer(name, gameResult) {
  const res = await fetch(`${config.BACKEND_URL}/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gameResult }),
  });
  return res.json();
}

module.exports = { createGame, getGame, updatePlayer };
