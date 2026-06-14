import { useEffect } from 'react';
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseEther, parseUnits, formatEther, formatUnits, erc20Abi } from 'viem';
import { PONG_ESCROW_ADDRESS, PONG_ESCROW_ABI } from '../contracts/PongEscrow';
import { isNativeToken, CURRENCIES } from '../config/currencies';
import { ENVIRONMENT, IS_MAINNET } from '../config/env';

function getRpcUrls(chain) {
  return chain?.rpcUrls?.default?.http || chain?.rpcUrls?.public?.http || [];
}

async function logStakeTransaction(label, phase, details) {
  let providerChainId = null;

  try {
    providerChainId = window.ethereum
      ? Number(await window.ethereum.request({ method: 'eth_chainId' }))
      : null;
  } catch (error) {
    console.warn(`[PONG-IT][${label}] Unable to query injected provider chain`, error);
  }

  console.group(`[PONG-IT][${label}] ${phase}`);
  console.table({
    environment: ENVIRONMENT,
    expectedChainId: IS_MAINNET ? 42220 : 11142220,
    walletChainId: details.chainId ?? null,
    providerChainId,
    walletAddress: details.walletAddress ?? null,
    contractAddress: PONG_ESCROW_ADDRESS,
    transactionTo: details.to ?? PONG_ESCROW_ADDRESS,
    roomCode: details.roomCode,
    currency: details.currency,
    stakeAmount: details.stakeAmount,
    contractAmount: details.contractAmount?.toString?.() ?? details.contractAmount ?? null,
    transactionValue: details.value?.toString?.() ?? details.value ?? '0',
    transactionHash: details.hash ?? 'pending'
  });
  console.log('Configured chain RPC URLs:', getRpcUrls(details.chain));
  console.log('Raw transaction details:', details);
  console.groupEnd();
}

function useStakeReceiptDiagnostics(label, hash, receipt, chain) {
  useEffect(() => {
    if (!hash || !receipt) {
      return;
    }

    console.group(`[PONG-IT][${label}] transaction confirmed`);
    console.table({
      environment: ENVIRONMENT,
      chainId: chain?.id ?? null,
      chainName: chain?.name ?? null,
      contractAddress: PONG_ESCROW_ADDRESS,
      transactionTo: receipt.to ?? null,
      transactionFrom: receipt.from ?? null,
      transactionHash: receipt.transactionHash || hash,
      blockNumber: receipt.blockNumber?.toString?.() ?? receipt.blockNumber,
      status: receipt.status
    });
    console.log('Configured chain RPC URLs:', getRpcUrls(chain));
    console.log('Raw transaction receipt:', receipt);
    console.groupEnd();
  }, [label, hash, receipt, chain]);
}

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
  const { address: walletAddress, chain, chainId } = useAccount();
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useStakeReceiptDiagnostics('stakeAsPlayer1', hash, receipt, chain);

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

      await logStakeTransaction('stakeAsPlayer1', 'wallet request', {
        chain,
        chainId,
        walletAddress,
        roomCode,
        currency: currency.symbol,
        stakeAmount,
        contractAmount: amount,
        value: txOpts.value,
        to: txOpts.address
      });

      const submittedHash = await writeContractAsync(txOpts);
      await logStakeTransaction('stakeAsPlayer1', 'transaction submitted', {
        chain,
        chainId,
        walletAddress,
        roomCode,
        currency: currency.symbol,
        stakeAmount,
        contractAmount: amount,
        value: txOpts.value,
        to: txOpts.address,
        hash: submittedHash
      });

      return submittedHash;
    } catch (err) {
      console.error('Error staking as player 1:', err);
      throw err;
    }
  };

  return { stakeAsPlayer1, hash, receipt, isPending, isConfirming, isSuccess, error };
}

// ============ Stake as Player 2 (Join Match) ============

export function useStakeAsPlayer2() {
  const { address: walletAddress, chain, chainId } = useAccount();
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useStakeReceiptDiagnostics('stakeAsPlayer2', hash, receipt, chain);

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

      await logStakeTransaction('stakeAsPlayer2', 'wallet request', {
        chain,
        chainId,
        walletAddress,
        roomCode,
        currency: currency.symbol,
        stakeAmount,
        contractAmount: amount,
        value: txOpts.value,
        to: txOpts.address
      });

      const submittedHash = await writeContractAsync(txOpts);
      await logStakeTransaction('stakeAsPlayer2', 'transaction submitted', {
        chain,
        chainId,
        walletAddress,
        roomCode,
        currency: currency.symbol,
        stakeAmount,
        contractAmount: amount,
        value: txOpts.value,
        to: txOpts.address,
        hash: submittedHash
      });

      return submittedHash;
    } catch (err) {
      console.error('Error staking as player 2:', err);
      throw err;
    }
  };

  return { stakeAsPlayer2, hash, receipt, isPending, isConfirming, isSuccess, error };
}

// ============ Claim Prize ============

export function useClaimPrize() {
  const { address: walletAddress, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimPrize = async (roomCode, signature, feeCurrencyAddress) => {
    try {
      if (!walletAddress || !publicClient) {
        throw new Error('Connect the winning wallet before claiming.');
      }

      const txOpts = {
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'claimPrize',
        args: [roomCode, signature],
      };
      if (feeCurrencyAddress) {
        txOpts.feeCurrency = feeCurrencyAddress;
      }

      const match = await publicClient.readContract({
        address: PONG_ESCROW_ADDRESS,
        abi: PONG_ESCROW_ABI,
        functionName: 'getMatch',
        args: [roomCode],
      });
      const status = Number(match.status ?? match[5]);
      const onChainWinner = match.winner ?? match[4];

      if (status === 3) {
        const claimedByConnectedWallet =
          onChainWinner?.toLowerCase() === walletAddress.toLowerCase();

        if (!claimedByConnectedWallet) {
          throw new Error('This prize was already claimed by another wallet.');
        }

        return { alreadyClaimed: true, hash: null };
      }

      if (status !== 2) {
        throw new Error('This match is not ready for prize claiming.');
      }

      await publicClient.simulateContract({
        ...txOpts,
        account: walletAddress,
      });

      console.group('[PONG-IT][claimPrize] wallet request');
      console.table({
        environment: ENVIRONMENT,
        chainId: chain?.id ?? null,
        walletAddress,
        contractAddress: PONG_ESCROW_ADDRESS,
        roomCode,
      });
      console.groupEnd();

      const submittedHash = await writeContractAsync(txOpts);
      return { alreadyClaimed: false, hash: submittedHash };
    } catch (err) {
      console.error('Error claiming prize:', err);
      throw err;
    }
  };

  return { claimPrize, hash, receipt, isPending, isConfirming, isSuccess, error };
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

export function useClaimAbandonedMatchRefund() {
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimAbandonedMatchRefund = async (roomCode, signature) => {
    return writeContractAsync({
      address: PONG_ESCROW_ADDRESS,
      abi: PONG_ESCROW_ABI,
      functionName: 'claimAbandonedMatchRefund',
      args: [roomCode, signature],
    });
  };

  return {
    claimAbandonedMatchRefund,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error
  };
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

// ============ Engagement: Check-In ============

export function useCheckIn() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const checkIn = async () => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'checkIn',
    });
  };

  return { checkIn, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Engagement: Daily Reward ============

export function useClaimDailyReward() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimDailyReward = async () => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'claimDailyReward',
    });
  };

  return { claimDailyReward, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Engagement: Practice Mode ============

export function usePracticeMode() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const practiceMode = async () => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'practiceMode',
    });
  };

  return { practiceMode, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Engagement: GG ============

export function useGG() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const sendGG = async (roomCode) => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'gg', args: [roomCode],
    });
  };

  return { sendGG, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Engagement: Challenge ============

export function useCreateChallenge() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createChallenge = async (roomCode, tokenAddress, amountWei) => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'createChallenge',
      args: [roomCode, tokenAddress || '0x0000000000000000000000000000000000000000', amountWei],
    });
  };

  return { createChallenge, hash, isPending, isConfirming, isSuccess, error };
}

export function useAcceptChallenge() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const acceptChallenge = async (roomCode) => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'acceptChallenge', args: [roomCode],
    });
  };

  return { acceptChallenge, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Engagement: Report Match ============

export function useReportMatch() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const reportMatch = async (roomCode, score1, score2) => {
    await writeContract({
      address: PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
      functionName: 'reportMatch', args: [roomCode, score1, score2],
    });
  };

  return { reportMatch, hash, isPending, isConfirming, isSuccess, error };
}
