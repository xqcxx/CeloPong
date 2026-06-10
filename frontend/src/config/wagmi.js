import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { celo, celoSepolia } from '@reown/appkit/networks';

const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const metadata = {
  name: 'PONG-IT',
  description: 'Multiplayer Pong with Crypto Staking on Celo',
  url: 'https://pong-it.app',
  icons: ['https://pong-it.app/logo.png']
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
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#7b3fe4',
    '--w3m-border-radius-master': '8px',
  },
  features: {
    analytics: true,
  }
});

export { celo, celoSepolia };
