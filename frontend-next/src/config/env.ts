// Environment-aware config — all values come from env vars
// Switch between testnet/mainnet via NEXT_PUBLIC_ENVIRONMENT

const ENV = process.env.NEXT_PUBLIC_ENVIRONMENT || 'testnet';
const isMainnet = ENV === 'mainnet';

function envVar(name: string): string {
  const prefix = isMainnet ? 'MAINNET' : 'TESTNET';
  return process.env[`NEXT_PUBLIC_${prefix}_${name}`] || '';
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

// Fee currency adapters (Celo CIP-64)
// 6-decimal tokens use adapter addresses; 18-decimal tokens use token addresses directly
export const FEE_ADAPTERS = {
  USDC: envVar('USDC_ADAPTER'),
  USDT: envVar('USDT_ADAPTER'),
};
