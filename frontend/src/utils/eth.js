/* global BigInt */
import { formatEther, parseEther } from 'viem';

const ZERO = 0n;

// Safely parse text/number ETH inputs into wei
function safeParseEther(value) {
  if (value === undefined || value === null || value === '') {
    return ZERO;
  }

  try {
    return parseEther(String(value));
  } catch {
    return ZERO;
  }
}

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  // Honor whole, non-negative numeric multipliers instead of forcing 2×
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  return 2n; // fallback default multiplier
}
export function computePrizeFromStake(stakeAmount, multiplier = 2n) {
  const stakeWei = safeParseEther(stakeAmount);
  const multiplierWei = toBigInt(multiplier);
  const payoutWei = stakeWei * multiplierWei;
  if (stakeWei === ZERO && stakeAmount) {
    console.warn('[MyWins] Unable to parse stake amount:', stakeAmount);
  }

  return {
    stakeWei,
    payoutWei,
    multiplier: multiplierWei,
    formattedStake: formatEther(stakeWei),
    formattedPayout: formatEther(payoutWei),
  };
}

// Helper to trim formatted ETH decimals without trailing zeros
function trimDecimals(value, digits = 4) {
  if (typeof value !== 'string' || !value.includes('.')) {
    return value;
  }

  const [intPart, fraction = ''] = value.split('.');
  const trimmedFraction = fraction.slice(0, digits).replace(/0+$/, '');

  return trimmedFraction.length > 0 ? `${intPart}.${trimmedFraction}` : intPart;
}

export function formatWeiToEth(weiValue, digits = 4) {
  let wei;
  if (typeof weiValue === 'bigint') {
    wei = weiValue;
  } else {
    // Coerce integer-like wei values; anything unparseable formats as 0
    try {
      wei = BigInt(weiValue);
    } catch {
      return '0';
    }
  }
  return trimDecimals(formatEther(wei), digits);
}

export function sumWei(values) {
  if (!Array.isArray(values)) {
    return ZERO;
  }
  return values.reduce((acc, value) => {
    if (typeof value === 'bigint') {
      return acc + value;
    }
    return acc + safeParseEther(value);
  }, ZERO);
}
