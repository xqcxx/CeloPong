// MiniPay detection and helpers

export function isMiniPay() {
  return typeof window !== 'undefined' && window.ethereum?.isMiniPay === true;
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
