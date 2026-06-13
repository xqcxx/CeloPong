import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { BACKEND_URL } from '../constants';
import { useClaimRefund, useGetMatch } from '../hooks/useContract';
import { useNotification } from './notifications/NotificationProvider';

const JOIN_TIMEOUT_SECONDS = 10 * 60;
const PLAYER1_STAKED_STATUS = 1;

function PendingStakeCard({ game, playerAddress, onRefunded }) {
  const { data: matchData, refetch } = useGetMatch(game.roomCode);
  const {
    claimRefund,
    isPending,
    isConfirming,
    isSuccess,
    error
  } = useClaimRefund();
  const { notify } = useNotification();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const reportedRef = useRef(false);

  const status = Number(matchData?.status ?? matchData?.[5] ?? 0);
  const createdAt = Number(matchData?.createdAt ?? matchData?.[6] ?? 0);
  const refundAt = createdAt + JOIN_TIMEOUT_SECONDS;
  const secondsRemaining = Math.max(0, refundAt - now);
  const canRefund = status === PLAYER1_STAKED_STATUS && createdAt > 0 && secondsRemaining === 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!error) return;
    notify(error.message || 'Refund transaction failed.', { type: 'error', duration: 0 });
  }, [error, notify]);

  useEffect(() => {
    if (!isSuccess || reportedRef.current) return;
    reportedRef.current = true;

    const confirmRefund = async () => {
      try {
        await refetch();
        const response = await fetch(`${BACKEND_URL}/games/${game.roomCode}/refunded`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerAddress })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Refund confirmed, but database update failed');
        }
        notify(`Stake for room ${game.roomCode} was refunded.`, { type: 'success' });
        onRefunded(game.roomCode);
      } catch (confirmError) {
        reportedRef.current = false;
        notify(confirmError.message, { type: 'error', duration: 0 });
      }
    };

    confirmRefund();
  }, [isSuccess, game.roomCode, playerAddress, onRefunded, notify, refetch]);

  if (matchData && status !== PLAYER1_STAKED_STATUS) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="pending-stake-card">
      <div>
        <strong>Room {game.roomCode}</strong>
        <span>{game.stakeAmount} {game.stakeCurrency || 'CELO'}</span>
      </div>
      <div className="pending-stake-action">
        {!canRefund ? (
          <span className="pending-stake-countdown">
            Refund in {minutes}:{String(seconds).padStart(2, '0')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => claimRefund(game.roomCode)}
            disabled={isPending || isConfirming}
          >
            {isPending ? 'Confirm Refund' : isConfirming ? 'Refunding...' : 'Claim Refund'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PendingStakes() {
  const { address, isConnected } = useAccount();
  const { notify } = useNotification();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPendingStakes = useCallback(async () => {
    if (!isConnected || !address) {
      setGames([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/games/pending-stakes/${address}`);
      if (!response.ok) {
        throw new Error('Unable to load pending stakes');
      }
      setGames(await response.json());
    } catch (error) {
      notify(error.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, notify]);

  useEffect(() => {
    loadPendingStakes();
  }, [loadPendingStakes]);

  const handleRefunded = useCallback((roomCode) => {
    setGames(current => current.filter(game => game.roomCode !== roomCode));
  }, []);

  if (!isConnected || (!loading && games.length === 0)) {
    return null;
  }

  return (
    <section className="pending-stakes">
      <div className="pending-stakes-heading">
        <div>
          <h2>Pending Stakes</h2>
          <p>Unmatched stakes remain recoverable after the join timeout.</p>
        </div>
        <button type="button" onClick={loadPendingStakes} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      <div className="pending-stakes-list">
        {games.map(game => (
          <PendingStakeCard
            key={game.roomCode}
            game={game}
            playerAddress={address}
            onRefunded={handleRefunded}
          />
        ))}
      </div>
    </section>
  );
}
