// Supported staking currencies on Celo
// Creator picks the currency; joiner is locked to it.
// Token addresses come from env vars (testnet or mainnet).

import { TOKEN_ADDRESSES, FEE_ADAPTERS } from './env';

export const CURRENCIES = {
  // Order matters — cUSD first for MiniPay users who primarily hold stablecoins
  cUSD: {
    key: 'cUSD',
    symbol: 'cUSD',
    name: 'cUSD (Mento)',
    tokenAddress: TOKEN_ADDRESSES.cUSD,
    decimals: 18,
    icon: '\u{1F4B5}',
    presets: ['1', '5', '10', '25', '50'],
    color: '#45CD85',
  },
  USDC: {
    key: 'USDC',
    symbol: 'USDC',
    name: 'USDC (Circle)',
    tokenAddress: TOKEN_ADDRESSES.USDC,
    decimals: 6,
    icon: '\u{1F4B2}',
    presets: ['1', '5', '10', '25', '50'],
    color: '#2775CA',
  },
  USDT: {
    key: 'USDT',
    symbol: 'USDT',
    name: 'USDT (Tether)',
    tokenAddress: TOKEN_ADDRESSES.USDT,
    decimals: 6,
    icon: '\u{1F48E}',
    presets: ['1', '5', '10', '25', '50'],
    color: '#26A17B',
  },
  CELO: {
    key: 'CELO',
    symbol: 'CELO',
    name: 'CELO (Native)',
    tokenAddress: null,
    decimals: 18,
    icon: '\u{1F7E1}',
    presets: ['0.1', '0.5', '1', '5', '10'],
    color: '#35D07F',
  },
};

// Fee currencies for gas payment (Celo fee abstraction)
// Use adapter addresses for 6-decimal tokens (USDC, USDT)
export const FEE_CURRENCIES = {
  CELO: { symbol: 'CELO', address: null, adapter: null },
  cUSD: { symbol: 'cUSD', address: TOKEN_ADDRESSES.cUSD, adapter: null },
  USDC: { symbol: 'USDC', address: TOKEN_ADDRESSES.USDC, adapter: FEE_ADAPTERS.USDC },
  USDT: { symbol: 'USDT', address: TOKEN_ADDRESSES.USDT, adapter: FEE_ADAPTERS.USDT },
};

export function getCurrencyByKey(key) {
  return CURRENCIES[key] || null;
}

export function isNativeToken(tokenAddress) {
  return tokenAddress === null || tokenAddress === '0x0000000000000000000000000000000000000000';
}
