const fs = require('fs');
const path = require('path');

const NAMES_FILE = path.resolve(__dirname, '..', 'names.json');

const ADJECTIVES = ['Swift', 'Phantom', 'Shadow', 'Blaze', 'Frost', 'Iron', 'Noble', 'Rapid', 'Silent', 'Crimson', 'Golden', 'Lucky', 'Storm', 'Wild', 'Dark', 'Shining', 'Fierce', 'Gentle', 'Brave', 'Sneaky'];
const NOUNS = ['Paddle', 'Striker', 'Return', 'Volley', 'Spin', 'Smash', 'Slice', 'Rally', 'Serve', 'Ace', 'Lob', 'Drop', 'Drive', 'Block', 'Curve', 'Cross'];

function generateName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
}

function loadNames() {
  try {
    if (fs.existsSync(NAMES_FILE)) {
      return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveNames(names) {
  fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2));
}

function getName(address) {
  const key = address.toLowerCase();
  const names = loadNames();
  if (!names[key]) {
    names[key] = generateName();
    saveNames(names);
  }
  return names[key];
}

module.exports = { getName };
