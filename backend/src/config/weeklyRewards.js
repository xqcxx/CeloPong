// Weekly leaderboard reward configuration.
//
// The reward token is fixed to cUSD. The amount is env-configurable, and the
// cUSD token address is network-specific (set per deployment in .env).

const { ethers } = require('ethers');

const REWARD_TOKEN_SYMBOL = 'cUSD';

// Minimum games a player must have played within the week to be eligible
// (anti-collusion / anti-self-play threshold).
const MIN_GAMES_FOR_ELIGIBILITY = parseInt(
  process.env.WEEKLY_REWARD_MIN_GAMES || '10',
  10
);

// Human-readable reward amount in cUSD, e.g. "10" for 10 cUSD.
const REWARD_AMOUNT_DISPLAY = process.env.WEEKLY_REWARD_AMOUNT || '10';

// cUSD uses 18 decimals on Celo.
const REWARD_TOKEN_DECIMALS = 18;

/**
 * Reward amount as a base-unit (wei) string.
 * @returns {string}
 */
function getRewardAmountWei() {
  return ethers.parseUnits(REWARD_AMOUNT_DISPLAY, REWARD_TOKEN_DECIMALS).toString();
}

/**
 * The configured cUSD token address for the active network.
 * @returns {string}
 */
function getRewardTokenAddress() {
  const address = process.env.CUSD_TOKEN_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error('CUSD_TOKEN_ADDRESS is not configured or invalid');
  }
  return ethers.getAddress(address);
}

module.exports = {
  REWARD_TOKEN_SYMBOL,
  REWARD_TOKEN_DECIMALS,
  REWARD_AMOUNT_DISPLAY,
  MIN_GAMES_FOR_ELIGIBILITY,
  getRewardAmountWei,
  getRewardTokenAddress
};
