import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseEther, parseUnits, formatEther, formatUnits, erc20Abi } from 'viem';
import { PONG_ESCROW_ADDRESS, PONG_ESCROW_ABI } from '../contracts/PongEscrow';
import { isNativeToken, CURRENCIES } from '../config/currencies';

// ============ View Hooks ============

export function useIsRoomCodeAvailable(roomCode) {
  return useReadContract({
    address: PONG_ESCROW_ADDRESS,
    abi: PONG_ESCROW_ABI,
    functionName: 'isRoomCodeAvailable',
    args: [roomCode],
    enabled: !!roomCode && roomCode.length === 6,
  });
}

export function useGetMatch(roomCode) {
  return useReadContract({
    address: PONG_ESCROW_ADDRESS,
    abi: PONG_ESCROW_ABI,
    functionName: 'getMatch',
    args: [roomCode],
    enabled: !!roomCode && roomCode.length === 6,
  });
}

export function useGetMatchStatus(roomCode) {
  return useReadContract({
    address: PONG_ESCROW_ADDRESS,
    abi: PONG_ESCROW_ABI,
    functionName: 'getMatchStatus',
    args: [roomCode],
    enabled: !!roomCode && roomCode.length === 6,
  });
}

// ============ ERC-20 Allowance Hook ============

export function useTokenAllowance(owner, spender, tokenAddress) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
    enabled: !!owner && !!spender && !!tokenAddress,
  });
}

// ============ ERC-20 Approve Hook ============

export function useApproveToken() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = async (tokenAddress, spender, amountWei) => {
    try {
      await writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amountWei],
      });
    } catch (err) {
      console.error('Error approving token:', err);
      throw err;
    }
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Stake as Player 1 (Create Match) ============

export function useStakeAsPlayer1() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stakeAsPlayer1 = async (roomCode, currency, stakeAmount, feeCurrencyAddress) => {
    try {
      const amount = isNativeToken(currency.tokenAddress)
        ? 0n
        : parseUnits(stakeAmount, currency.decimals);

      const txOpts = {
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'stakeAsPlayer1',
        args: [roomCode, currency.tokenAddress || '0x0000000000000000000000000000000000000000', amount],
      };

      if (isNativeToken(currency.tokenAddress)) {
        txOpts.value = parseEther(stakeAmount);
      }

      if (feeCurrencyAddress) {
        txOpts.feeCurrency = feeCurrencyAddress;
      }

      await writeContract(txOpts);
    } catch (err) {
      console.error('Error staking as player 1:', err);
      throw err;
    }
  };

  return { stakeAsPlayer1, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Stake as Player 2 (Join Match) ============

export function useStakeAsPlayer2() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stakeAsPlayer2 = async (roomCode, currency, stakeAmount, feeCurrencyAddress) => {
    try {
      const amount = isNativeToken(currency.tokenAddress)
        ? 0n
        : parseUnits(stakeAmount, currency.decimals);

      const txOpts = {
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'stakeAsPlayer2',
        args: [roomCode, amount],
      };

      if (isNativeToken(currency.tokenAddress)) {
        txOpts.value = parseEther(stakeAmount);
      }

      if (feeCurrencyAddress) {
        txOpts.feeCurrency = feeCurrencyAddress;
      }

      await writeContract(txOpts);
    } catch (err) {
      console.error('Error staking as player 2:', err);
      throw err;
    }
  };

  return { stakeAsPlayer2, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Claim Prize ============

export function useClaimPrize() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimPrize = async (roomCode, signature, feeCurrencyAddress) => {
    try {
      const txOpts = {
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'claimPrize',
        args: [roomCode, signature],
      };
      if (feeCurrencyAddress) {
        txOpts.feeCurrency = feeCurrencyAddress;
      }
      await writeContract(txOpts);
    } catch (err) {
      console.error('Error claiming prize:', err);
      throw err;
    }
  };

  return { claimPrize, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Claim Refund ============

export function useClaimRefund() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimRefund = async (roomCode, feeCurrencyAddress) => {
    try {
      const txOpts = {
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'claimRefund',
        args: [roomCode],
      };
      if (feeCurrencyAddress) {
        txOpts.feeCurrency = feeCurrencyAddress;
      }
      await writeContract(txOpts);
    } catch (err) {
      console.error('Error claiming refund:', err);
      throw err;
    }
  };

  return { claimRefund, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Wallet Balance Hook ============

export function useWalletBalances(address) {
  const enabled = !!address;

  const { data: celoBalance } = useBalance({ address, enabled });

  const { data: cUSDBalance } = useReadContract({
    address: CURRENCIES.cUSD.tokenAddress,
    abi: erc20Abi, functionName: 'balanceOf', args: [address],
    enabled: enabled && !!CURRENCIES.cUSD.tokenAddress,
  });

  const { data: usdcBalance } = useReadContract({
    address: CURRENCIES.USDC.tokenAddress,
    abi: erc20Abi, functionName: 'balanceOf', args: [address],
    enabled: enabled && !!CURRENCIES.USDC.tokenAddress,
  });

  const { data: usdtBalance } = useReadContract({
    address: CURRENCIES.USDT.tokenAddress,
    abi: erc20Abi, functionName: 'balanceOf', args: [address],
    enabled: enabled && !!CURRENCIES.USDT.tokenAddress,
  });

  return {
    CELO: celoBalance ? parseFloat(formatEther(celoBalance.value)).toFixed(2) : null,
    cUSD: cUSDBalance != null ? parseFloat(formatUnits(cUSDBalance, 18)).toFixed(2) : null,
    USDC: usdcBalance != null ? parseFloat(formatUnits(usdcBalance, 6)).toFixed(2) : null,
    USDT: usdtBalance != null ? parseFloat(formatUnits(usdtBalance, 6)).toFixed(2) : null,
  };
}
