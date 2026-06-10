// Environment-aware config — all values come from env vars
// Switch between testnet/mainnet via REACT_APP_ENVIRONMENT

const ENV = process.env.REACT_APP_ENVIRONMENT || 'testnet';
const isMainnet = ENV === 'mainnet';

function envVar(name) {
  const prefix = isMainnet ? 'MAINNET' : 'TESTNET';
  return process.env[`REACT_APP_${prefix}_${name}`] || '';
}

export const PONG_ESCROW_ADDRESS = envVar('PONG_ESCROW_ADDRESS');
export const BLOCK_EXPLORER_URL = envVar('EXPLORER');
export const ENVIRONMENT = ENV;
export const IS_MAINNET = isMainnet;

export const TOKEN_ADDRESSES = {
  cUSD: envVar('cUSD'),
  USDC: envVar('USDC'),
  USDT: envVar('USDT'),
};
