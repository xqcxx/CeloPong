import React, { useEffect, useState } from 'react';
import { WagmiProvider, useConnect, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter } from '../config/wagmi';
import { isMiniPay, connectMiniPay } from '../utils/minipay';

const queryClient = new QueryClient();

function MiniPayAutoConnect({ children }) {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  const [connectFailed, setConnectFailed] = useState(false);

  useEffect(() => {
    if (!isMiniPay() || isConnected) return;
    const injected = connectors.find(c => c.type === 'injected');
    if (injected) {
      connect({ connector: injected }).catch(() => setConnectFailed(true));
    } else {
      connectMiniPay().then(() => {}).catch(() => setConnectFailed(true));
    }
  }, [connectors, isConnected, connect]);

  return (
    <>
      {children}
      {isMiniPay() && !isConnected && connectFailed && (
        <div style={{
          position: 'fixed', top: 10, left: 0, right: 0, zIndex: 9999,
          background: '#ff6b6b', color: '#fff', padding: '10px 16px',
          textAlign: 'center', fontSize: '0.85rem'
        }}>
          Wallet connection failed. Please reopen this page in MiniPay or{' '}
          <button
            onClick={() => {
              setConnectFailed(false);
              const injected = connectors.find(c => c.type === 'injected');
              if (injected) connect({ connector: injected });
            }}
            style={{ background: '#fff', color: '#ff6b6b', border: 'none',
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
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
