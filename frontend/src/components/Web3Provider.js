import React, { useEffect } from 'react';
import { WagmiProvider, useConnect, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter } from '../config/wagmi';
import { isMiniPay, connectMiniPay } from '../utils/minipay';

const queryClient = new QueryClient();

function MiniPayAutoConnect({ children }) {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (isMiniPay() && !isConnected) {
      const injected = connectors.find(c => c.type === 'injected');
      if (injected) {
        connect({ connector: injected });
      } else {
        connectMiniPay().catch(() => {});
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return children;
}

export function Web3Provider({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniPayAutoConnect>
          {children}
        </MiniPayAutoConnect>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
