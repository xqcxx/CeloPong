import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { celo, celoSepolia } from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const metadata = {
  name: 'PONG-IT',
  description: 'Stake cUSD. Play Pong. Win 2x back. Built for MiniPay on Celo.',
  url: 'https://pong-it.app',
  icons: ['https://pong-it.app/icons/icon-512.png'],
};

export const wagmiAdapter = new WagmiAdapter({
  networks: [celoSepolia, celo],
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [celoSepolia, celo],
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#35D07F',
    '--w3m-border-radius-master': '12px',
  },
  features: {
    analytics: true,
  },
});

export { celo, celoSepolia };
