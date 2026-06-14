import { useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { BACKEND_URL } from '../constants';

const STORAGE_PREFIX = 'pong-it-wallet-session';

function storageKey(address) {
  return `${STORAGE_PREFIX}:${address.toLowerCase()}`;
}

export function getStoredWalletSession(address) {
  if (!address) return null;
  try {
    const session = JSON.parse(sessionStorage.getItem(storageKey(address)));
    return session?.token && new Date(session.expiresAt).getTime() > Date.now()
      ? session
      : null;
  } catch {
    return null;
  }
}

export function useWalletSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const ensureWalletSession = useCallback(async () => {
    if (!address) {
      throw new Error('Connect your wallet before entering a staked room.');
    }

    const stored = getStoredWalletSession(address);
    if (stored) return stored.token;

    const challengeResponse = await fetch(
      `${BACKEND_URL}/auth/wallet-challenge/${address}`
    );
    if (!challengeResponse.ok) {
      throw new Error('Unable to create wallet session challenge.');
    }
    const challenge = await challengeResponse.json();
    const signature = await signMessageAsync({ message: challenge.message });

    const sessionResponse = await fetch(`${BACKEND_URL}/auth/wallet-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, signature })
    });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) {
      throw new Error(session.error || 'Unable to authenticate wallet session.');
    }

    sessionStorage.setItem(storageKey(address), JSON.stringify(session));
    return session.token;
  }, [address, signMessageAsync]);

  return { ensureWalletSession };
}
