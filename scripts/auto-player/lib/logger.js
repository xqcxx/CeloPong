const config = require('./config');

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};

function time() {
  return new Date().toISOString().slice(11, 19);
}

function txLink(hash) {
  const short = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  return `${short} \x1b]8;;${config.EXPLORER_URL}/tx/${hash}\x1b\\↗\x1b]8;;\x1b\\`;
}

function log(msg) {
  console.log(`${colors.dim(`[${time()}]`)} ${msg}`);
}

function matchHeader(n, total) {
  const padding = '─'.repeat(40);
  console.log(`\n${colors.cyan(padding)}`);
  console.log(`${colors.cyan(`  Match ${n}${total ? '/' + total : ''}`)}  ${colors.dim(new Date().toISOString())}`);
}

function step(icon, msg, hash) {
  const link = hash ? `  → ${txLink(hash)}` : '';
  log(`${icon ? icon + ' ' : ''}${msg}${link}`);
}

function winner(name, score) {
  log(colors.yellow(`  Winner: ${name} ${score ? score : ''}`));
}

function done(elapsedMs) {
  log(colors.green(`  Done (${(elapsedMs / 1000).toFixed(1)}s)`));
}

function balances(b1, b2, sym) {
  log(colors.dim(`  Balances: P1=${b1} P2=${b2} ${sym}`));
}

module.exports = { colors, log, matchHeader, step, winner, done, balances, txLink };
