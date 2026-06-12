// MiniPay detection and helpers

export function isMiniPay() {
  return typeof window !== 'undefined' && window.ethereum?.isMiniPay === true;
}

// Check if connected wallet supports Celo CIP-64 fee abstraction
// MiniPay: handles natively (returns false — we hide our selector)
// Valora + other Celo-native wallets: support CIP-64
// MetaMask, Coinbase: no support
export function supportsFeeAbstraction() {
  if (typeof window === 'undefined' || !window.ethereum) return false;
  // MiniPay has native gas token UI — don't show ours
  if (window.ethereum.isMiniPay) return false;
  // Valora and other Celo-native wallets support CIP-64
  return window.ethereum.isValora === true;
}

export async function connectMiniPay() {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });
  return accounts[0] || null;
}
