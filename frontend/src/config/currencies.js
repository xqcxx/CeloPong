// Supported staking currencies on Celo
// Creator picks the currency; joiner is locked to it.

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
    tokenAddress: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b', // Celo Sepolia testnet
    tokenAddressMainnet: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    decimals: 18,
    icon: '\u{1F4B5}',
    presets: ['1', '5', '10', '25', '50'],
    color: '#45CD85',
  },
  USDC: {
    key: 'USDC',
    symbol: 'USDC',
    name: 'USDC (Circle)',
    tokenAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', // Celo Sepolia testnet
    tokenAddressMainnet: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    decimals: 6,
    icon: '\u{1F4B2}',
    presets: ['1', '5', '10', '25', '50'],
    color: '#2775CA',
  },
  USDT: {
    key: 'USDT',
    symbol: 'USDT',
    name: 'USDT (Tether)',
    tokenAddress: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', // Celo Sepolia testnet
    tokenAddressMainnet: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
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
  cUSD: { symbol: 'cUSD', address: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b', adapter: null },
  USDC: { symbol: 'USDC', address: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', adapter: '0x4822e58de6f5e485eF90df51C41CE01721331dC0' },
  USDT: { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', adapter: '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72' },
};

export function getCurrencyByKey(key) {
  return CURRENCIES[key] || null;
}

export function isNativeToken(tokenAddress) {
  return tokenAddress === null || tokenAddress === '0x0000000000000000000000000000000000000000';
}
