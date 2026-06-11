import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { celo, celoSepolia } from '@reown/appkit/networks';

const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const inMiniPay = typeof window !== 'undefined' && window.ethereum?.isMiniPay === true;

const metadata = {
  name: 'PONG-IT',
  description: 'Stake cUSD. Play Pong. Win 2\u00d7 back. Built for MiniPay on Celo.',
  url: 'https://pong-it.app',
  icons: ['https://pong-it.app/icons/icon-512.png']
};

export const wagmiAdapter = new WagmiAdapter({
  networks: [celoSepolia, celo],
  projectId,
  defaultNetwork: celoSepolia,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [celoSepolia, celo],
  projectId,
  metadata,
  themeMode: 'dark', // default — MiniPay override in Web3Provider
  themeVariables: {
    '--w3m-accent': '#35D07F', // Celo green accent
    '--w3m-border-radius-master': '12px',
  },
  features: {
    analytics: true,
  }
});

export { celo, celoSepolia };
