// Supported staking currencies on Celo
// Creator picks the currency; joiner is locked to it.
// Token addresses come from env vars (testnet or mainnet).

import { TOKEN_ADDRESSES } from './env';

export const CURRENCIES = {
  CELO: {
    key: 'CELO',
    symbol: 'CELO',
    name: 'CELO (Native)',
    tokenAddress: null, // address(0) = native CELO
    decimals: 18,
    icon: '\u{1F7E1}',
    presets: ['0.1', '0.5', '1', '5', '10'],
    color: '#35D07F',
  },
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
};

// Fee currencies for gas payment (Celo fee abstraction)
// Use adapter addresses for 6-decimal tokens (USDC, USDT)
export const FEE_CURRENCIES = {
  CELO: { symbol: 'CELO', address: null, adapter: null },
  cUSD: { symbol: 'cUSD', address: TOKEN_ADDRESSES.cUSD, adapter: null },
  USDC: { symbol: 'USDC', address: TOKEN_ADDRESSES.USDC, adapter: '0x4822e58de6f5e485eF90df51C41CE01721331dC0' },
  USDT: { symbol: 'USDT', address: TOKEN_ADDRESSES.USDT, adapter: '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72' },
};

export function getCurrencyByKey(key) {
  return CURRENCIES[key] || null;
}

export function isNativeToken(tokenAddress) {
  return tokenAddress === null || tokenAddress === '0x0000000000000000000000000000000000000000';
}
