import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { PONG_ESCROW_ADDRESS, PONG_ESCROW_ABI } from '../contracts/PongEscrow';
import { useWalletSession } from '../hooks/useWalletSession';
import {
  useFundRewardPool,
  useApproveReward,
  useWithdrawRewardPool,
  useRewardPoolBalance,
  useTokenAllowance,
  useApproveToken
} from '../hooks/useContract';
import { isNativeToken } from '../config/currencies';
import { fetchRewardConfig, fetchPendingRewards, recordRewardApproval, reconcileRewards } from '../api/rewards';
import { formatRewardAmount, formatWeekLabel, getRewardStatusLabel } from '../utils/rewards';
import '../styles/Rewards.css';

const AdminRewards = () => {
  const { address, isConnected } = useAccount();
  const { ensureWalletSession } = useWalletSession();
  const { fundRewardPool } = useFundRewardPool();
  const { approveReward } = useApproveReward();
  const { withdrawRewardPool } = useWithdrawRewardPool();
  const { approve: approveToken } = useApproveToken();

  const [config, setConfig] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [fundAmount, setFundAmount] = useState('');
  const [drainAmount, setDrainAmount] = useState('');
  const [drainTo, setDrainTo] = useState('');

  // On-chain owner gate.
  const { data: onChainOwner } = useReadContract({
    address: PONG_ESCROW_ADDRESS,
    abi: PONG_ESCROW_ABI,
    functionName: 'owner'
  });
  const isOwner = isConnected && onChainOwner &&
    address?.toLowerCase() === onChainOwner.toLowerCase();

  const tokenAddress = config?.tokenAddress;
  const { data: poolBalance, refetch: refetchPool } = useRewardPoolBalance(tokenAddress);
  const { data: rewardTokenAllowance, refetch: refetchAllowance } = useTokenAllowance(
    address,
    PONG_ESCROW_ADDRESS,
    tokenAddress
  );

  const loadPending = useCallback(async () => {
    if (!isOwner) return;
    setError(null);
    try {
      const token = await ensureWalletSession();
      const data = await fetchPendingRewards(token);
      setPending(data.pending || []);
    } catch (err) {
      if (err.status === 401 && address) {
        try {
          const token = await ensureWalletSession({ forceNew: true });
          const data = await fetchPendingRewards(token);
          setPending(data.pending || []);
          return;
        } catch (retryErr) {
          setError(retryErr.message);
          return;
        }
      }
      setError(err.message);
    }
  }, [address, isOwner, ensureWalletSession]);

  useEffect(() => { fetchRewardConfig().then(setConfig).catch((e) => setError(e.message)); }, []);
  useEffect(() => { loadPending(); }, [loadPending]);

  const handleFund = async () => {
    if (!fundAmount || !tokenAddress) return;
    setBusyId('fund');
    setError(null);
    setNotice(null);
    try {
      const amountWei = parseUnits(fundAmount, 18);
      if (!isNativeToken(tokenAddress) && (rewardTokenAllowance ?? 0n) < amountWei) {
        setNotice(`Approving ${fundAmount} ${config.tokenSymbol} for the reward pool...`);
        await approveToken(tokenAddress, PONG_ESCROW_ADDRESS, amountWei);
        await refetchAllowance();
      }
      await fundRewardPool(tokenAddress, amountWei);
      setNotice(`Funded pool with ${fundAmount} ${config.tokenSymbol}.`);
      setFundAmount('');
      await refetchPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDrain = async () => {
    if (!drainAmount || !drainTo || !tokenAddress) return;
    setBusyId('drain');
    setError(null);
    setNotice(null);
    try {
      await withdrawRewardPool(tokenAddress, parseUnits(drainAmount, 18), drainTo);
      setNotice(`Sent ${drainAmount} ${config.tokenSymbol} to ${drainTo}.`);
      setDrainAmount('');
      setDrainTo('');
      await refetchPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReconcile = async () => {
    setBusyId('reconcile');
    setError(null);
    setNotice(null);
    try {
      const token = await ensureWalletSession();
      const result = await reconcileRewards(token);
      const changed = result.updated?.length || 0;
      setNotice(
        changed > 0
          ? `Synced ${changed} reward${changed === 1 ? '' : 's'} from chain.`
          : `Checked ${result.scanned} reward${result.scanned === 1 ? '' : 's'}; all in sync.`
      );
      await loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (reward) => {
    setBusyId(reward._id);
    setError(null);
    setNotice(null);
    try {
      const txHash = await approveReward(
        reward.weekKey,
        reward.walletAddress,
        reward.tokenAddress,
        reward.amount
      );
      const token = await ensureWalletSession();
      await recordRewardApproval(token, reward._id, txHash);
      setNotice(`Approved ${reward.weekKey} for ${reward.walletAddress}.`);
      await loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!isConnected) {
    return <div className="admin-rewards"><p>Connect the owner wallet to manage rewards.</p></div>;
  }
  if (!isOwner) {
    return <div className="admin-rewards"><p>This panel is restricted to the contract owner.</p></div>;
  }

  return (
    <div className="admin-rewards">
      <h2>Reward Pool Admin</h2>
      <p className="admin-rewards__hint">
        Fund the cUSD pool before approving requested weekly rewards. The contract owner approves
        each winner on-chain; the winner then withdraws from the approved allocation.
      </p>
      {config && (
        <p className="admin-rewards__hint">
          Current policy: {config.amount} {config.tokenSymbol} per completed week · minimum {config.minGames} games.
        </p>
      )}
      {error && <div className="admin-rewards__error">{error}</div>}
      {notice && <div className="admin-rewards__notice">{notice}</div>}

      <section className="admin-rewards__pool">
        <h3>Pool balance</h3>
        <p>
          {config ? `${formatRewardAmount(poolBalance ?? 0n)} ${config.tokenSymbol}` : 'Loading…'}
        </p>
        <div className="admin-rewards__fund">
          <input
            type="number"
            min="0"
            placeholder={`Fund amount (${config?.tokenSymbol || ''})`}
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
          />
          <button disabled={busyId === 'fund'} onClick={handleFund}>
            {busyId === 'fund' ? 'Funding…' : 'Fund pool'}
          </button>
        </div>
        <div className="admin-rewards__drain">
          <input
            type="number"
            min="0"
            placeholder={`Drain amount (${config?.tokenSymbol || ''})`}
            value={drainAmount}
            onChange={(e) => setDrainAmount(e.target.value)}
          />
          <input
            type="text"
            placeholder="Recipient address (0x…)"
            value={drainTo}
            onChange={(e) => setDrainTo(e.target.value)}
          />
          <button disabled={busyId === 'drain'} onClick={handleDrain}>
            {busyId === 'drain' ? 'Sending…' : 'Drain to wallet'}
          </button>
        </div>
      </section>

      <section className="admin-rewards__pending">
        <div className="admin-rewards__pending-head">
          <h3>Pending approvals</h3>
          <button
            className="admin-rewards__reconcile"
            disabled={busyId === 'reconcile'}
            onClick={handleReconcile}
          >
            {busyId === 'reconcile' ? 'Syncing…' : 'Refresh from chain'}
          </button>
        </div>
        {pending.length === 0 ? (
          <p>Nothing awaiting approval.</p>
        ) : (
          <ul>
            {pending.map((reward) => (
              <li key={reward._id} className="pending-row">
                <span className="week">{formatWeekLabel(reward.weekKey)}</span>
                <span className="winner">{reward.playerName || reward.walletAddress}</span>
                <span className="amount">{formatRewardAmount(reward.amount)} {reward.tokenSymbol}</span>
                <span className={`status status--${reward.status}`}>{getRewardStatusLabel(reward.status)}</span>
                {reward.status === 'requested' && (
                  <button disabled={busyId === reward._id} onClick={() => handleApprove(reward)}>
                    {busyId === reward._id ? 'Approving…' : 'Approve on-chain'}
                  </button>
                )}
                {reward.status === 'approved' && <span className="hint">Awaiting player withdrawal</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AdminRewards;
