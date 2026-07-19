/* global BigInt */
import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useWalletSession } from '../hooks/useWalletSession';
import { useWithdrawWeeklyReward } from '../hooks/useContract';
import {
  fetchRewardConfig,
  fetchWeeklyLeaderboard,
  fetchMyRewards,
  requestPayout,
  recordRewardClaim
} from '../api/rewards';

const STATUS_LABELS = {
  available: 'Available',
  requested: 'Payout requested',
  approved: 'Ready to withdraw',
  claimed: 'Claimed'
};

function formatAmount(amountWei, decimals = 18) {
  try {
    return formatUnits(BigInt(amountWei), decimals);
  } catch {
    return '0';
  }
}

const WeeklyRewards = () => {
  const { isConnected } = useAccount();
  const { ensureWalletSession } = useWalletSession();
  const { withdrawReward } = useWithdrawWeeklyReward();

  const [config, setConfig] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRewards, setMyRewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyWeek, setBusyWeek] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadPublic = useCallback(async () => {
    try {
      const [cfg, lb] = await Promise.all([
        fetchRewardConfig(),
        fetchWeeklyLeaderboard()
      ]);
      setConfig(cfg);
      setLeaderboard(lb.leaderboard || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadMine = useCallback(async () => {
    if (!isConnected) {
      setMyRewards([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await ensureWalletSession();
      const data = await fetchMyRewards(token);
      setMyRewards(data.rewards || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isConnected, ensureWalletSession]);

  useEffect(() => { loadPublic(); }, [loadPublic]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const handleRequest = async (weekKey) => {
    setBusyWeek(weekKey);
    setError(null);
    setNotice(null);
    try {
      const token = await ensureWalletSession();
      await requestPayout(token, weekKey);
      setNotice('Payout requested. An admin will approve it shortly.');
      await loadMine();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyWeek(null);
    }
  };

  const handleWithdraw = async (reward) => {
    setBusyWeek(reward.weekKey);
    setError(null);
    setNotice(null);
    try {
      const token = await ensureWalletSession();
      const txHash = await withdrawReward(reward.weekKey, reward.tokenAddress);
      await recordRewardClaim(token, reward.weekKey, txHash);
      setNotice('Reward withdrawn. It should arrive in your wallet shortly.');
      await loadMine();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyWeek(null);
    }
  };

  return (
    <div className="weekly-rewards">
      <h2>Weekly Rewards</h2>
      {config && (
        <p className="weekly-rewards__summary">
          Top the leaderboard this week to win {config.amount} {config.tokenSymbol}.
          Play at least {config.minGames} games to qualify. Current week: {config.currentWeekKey}.
        </p>
      )}

      {error && <div className="weekly-rewards__error">{error}</div>}
      {notice && <div className="weekly-rewards__notice">{notice}</div>}

      <section className="weekly-rewards__leaderboard">
        <h3>This week's standings</h3>
        {leaderboard.length === 0 ? (
          <p>No games recorded yet this week.</p>
        ) : (
          <ol>
            {leaderboard.map((row) => (
              <li key={row.walletAddress} className={row.eligible ? 'eligible' : 'ineligible'}>
                <span className="rank">#{row.rank}</span>
                <span className="name">{row.playerName || row.walletAddress}</span>
                <span className="wins">{row.wins} wins</span>
                <span className="games">{row.gamesPlayed} games</span>
                {!row.eligible && <span className="tag">needs {config?.minGames} games</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="weekly-rewards__mine">
        <h3>Your rewards</h3>
        {!isConnected ? (
          <p>Connect your wallet to see rewards you've won.</p>
        ) : loading ? (
          <p>Loading…</p>
        ) : myRewards.length === 0 ? (
          <p>No completed-week rewards yet. Keep playing.</p>
        ) : (
          <ul>
            {myRewards.map((reward) => {
              const busy = busyWeek === reward.weekKey;
              return (
                <li key={reward.weekKey} className="reward-row">
                  <span className="week">{reward.weekKey}</span>
                  <span className="amount">
                    {formatAmount(reward.amount)} {reward.tokenSymbol}
                  </span>
                  <span className={`status status--${reward.status}`}>
                    {STATUS_LABELS[reward.status] || reward.status}
                  </span>
                  {reward.status === 'available' && (
                    <button disabled={busy} onClick={() => handleRequest(reward.weekKey)}>
                      {busy ? 'Requesting…' : 'Request payout'}
                    </button>
                  )}
                  {reward.status === 'requested' && (
                    <span className="hint">Awaiting admin approval</span>
                  )}
                  {reward.status === 'approved' && (
                    <button disabled={busy} onClick={() => handleWithdraw(reward)}>
                      {busy ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  )}
                  {reward.status === 'claimed' && (
                    <span className="hint">Paid out</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default WeeklyRewards;
