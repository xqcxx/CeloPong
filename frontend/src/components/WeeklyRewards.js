import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useWalletSession } from '../hooks/useWalletSession';
import { useWithdrawWeeklyReward } from '../hooks/useContract';
import {
  fetchRewardConfig,
  fetchWeeklyLeaderboard,
  fetchMyRewards,
  requestPayout,
  recordRewardClaim
} from '../api/rewards';
import {
  formatRewardAmount,
  formatWeekLabel,
  getRewardStatusLabel,
  isEligibleLeaderboardRow
} from '../utils/rewards';

const WeeklyRewards = () => {
  const { address, isConnected } = useAccount();
  const { ensureWalletSession } = useWalletSession();
  const { withdrawReward } = useWithdrawWeeklyReward();

  const [config, setConfig] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRewards, setMyRewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [publicLoading, setPublicLoading] = useState(false);
  const [busyWeek, setBusyWeek] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadPublic = useCallback(async () => {
    setPublicLoading(true);
    try {
      const [cfg, lb] = await Promise.all([
        fetchRewardConfig(),
        fetchWeeklyLeaderboard()
      ]);
      setConfig(cfg);
      setLeaderboard(lb.leaderboard || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublicLoading(false);
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
      if (err.status === 401 && address) {
        try {
          const token = await ensureWalletSession({ forceNew: true });
          const data = await fetchMyRewards(token);
          setMyRewards(data.rewards || []);
          return;
        } catch (retryErr) {
          setError(retryErr.message);
          return;
        }
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, ensureWalletSession]);

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

  const minGames = config?.minGames || 0;
  const topEligible = leaderboard.find((row) => isEligibleLeaderboardRow(row, minGames));

  return (
    <div className="weekly-rewards">
      <div className="weekly-rewards__hero">
        <div>
          <h2>Weekly Rewards</h2>
          <p className="weekly-rewards__summary">
            Finish the week as the eligible leaderboard winner to earn a reward.
            Standings update as finished games are recorded.
          </p>
        </div>
        {config && (
          <span className="weekly-rewards__week-badge">
            {formatWeekLabel(config.currentWeekKey)} · Live
          </span>
        )}
      </div>

      {config && (
        <div className="weekly-rewards__rules" aria-label="Weekly reward rules">
          <div className="weekly-rewards__rule">
            <strong>{config.amount} {config.tokenSymbol}</strong>
            <span>Reward for the weekly winner</span>
          </div>
          <div className="weekly-rewards__rule">
            <strong>{config.minGames} games</strong>
            <span>Minimum finished games to qualify</span>
          </div>
          <div className="weekly-rewards__rule">
            <strong>Most wins</strong>
            <span>Rating and tie-break rules decide ties</span>
          </div>
        </div>
      )}

      {error && <div className="weekly-rewards__error">{error}</div>}
      {notice && <div className="weekly-rewards__notice">{notice}</div>}

      <section className="weekly-rewards__leaderboard">
        <div className="weekly-rewards__section-head">
          <h3>This week&apos;s standings</h3>
          <button disabled={publicLoading} onClick={loadPublic}>
            {publicLoading ? 'Refreshing…' : 'Refresh standings'}
          </button>
        </div>
        <p className="weekly-rewards__hint">
          {topEligible
            ? `${topEligible.playerName || 'The current leader'} is currently eligible. The final winner is recorded after the week ends.`
            : `No player has met the ${minGames || 'configured'}-game requirement with a win yet.`}
        </p>
        {leaderboard.length === 0 ? (
          <p>No games recorded yet this week.</p>
        ) : (
          <ol>
            {leaderboard.map((row) => (
              <li
                key={row.walletAddress}
                className={`leaderboard-row ${isEligibleLeaderboardRow(row, minGames) ? 'is-eligible' : 'is-ineligible'} ${topEligible?.walletAddress === row.walletAddress ? 'is-current' : ''}`}
              >
                <span className="rank">#{row.rank}</span>
                <span className="name">{row.playerName || row.walletAddress}</span>
                <span className="wins">{row.wins} wins</span>
                <span className="games">{row.gamesPlayed} games</span>
                {isEligibleLeaderboardRow(row, minGames) ? (
                  <span className="tag tag--eligible">Eligible</span>
                ) : (
                  <span className="tag">
                    {row.wins === 0 ? 'Needs a win' : `Needs ${minGames} games`}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="weekly-rewards__mine">
        <h3>Completed-week rewards</h3>
        <p className="weekly-rewards__hint">
          Rewards are created after a week closes. Requesting starts the admin approval process;
          withdrawal is available only after on-chain approval.
        </p>
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
                  <span className="week">{formatWeekLabel(reward.weekKey)}</span>
                  <span className="amount">
                    {formatRewardAmount(reward.amount)} {reward.tokenSymbol}
                  </span>
                  <span className={`status status--${reward.status}`}>
                    {getRewardStatusLabel(reward.status)}
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
