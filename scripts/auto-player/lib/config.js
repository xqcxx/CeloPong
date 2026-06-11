const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Default to testnet if CELO_ENV not explicitly set to mainnet
const env = process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : 'testnet';
const isMainnet = env === 'mainnet';
const prefix = isMainnet ? 'MAINNET' : 'TESTNET';

function envVar(name) {
  const envName = `${prefix}_${name}`;
  return process.env[envName] || process.env[`CELO_${isMainnet ? 'MAINNET' : 'SEPOLIA'}_${name}`] || '';
}

module.exports = {
  ENV: env,
  IS_MAINNET: isMainnet,
  RPC_URL: process.env[isMainnet ? 'CELO_MAINNET_RPC' : 'CELO_SEPOLIA_RPC']
    || (isMainnet ? 'https://forno.celo.org' : 'https://celo-sepolia.g.alchemy.com/v2/oA3aWf4dW3KozyXiBJ5TiZHnXtykfedo'),
  PONG_ESCROW_ADDRESS: envVar('PONG_ESCROW_ADDRESS'),
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8080',
  EXPLORER_URL: envVar('EXPLORER')
    || (isMainnet ? 'https://celoscan.io' : 'https://sepolia.celoscan.io'),

  CURRENCIES: {
    CELO: { token: null, decimals: 18, adapter: null },
    cUSD: {
      token: envVar('cUSD') || '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b',
      decimals: 18,
      adapter: null,
    },
    USDC: {
      token: envVar('USDC') || '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
      decimals: 6,
      adapter: envVar('USDC_ADAPTER')
        || (isMainnet ? '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' : '0x4822e58de6f5e485eF90df51C41CE01721331dC0'),
    },
    USDT: {
      token: envVar('USDT') || '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
      decimals: 6,
      adapter: envVar('USDT_ADAPTER') || '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72',
    },
  },
};
