import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../constants';
import {
  useClaimAbandonedMatchRefund,
  useClaimRefund,
  useGetMatch
} from '../hooks/useContract';
import { useNotification } from './notifications/NotificationProvider';
import { useWalletSession } from '../hooks/useWalletSession';

const JOIN_TIMEOUT_SECONDS = 10 * 60;
const PLAYER1_STAKED_STATUS = 1;

function PendingStakeCard({ game, playerAddress, onRefunded, onRejoin }) {
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
        {!canRefund && (
          <button type="button" onClick={() => onRejoin(game.roomCode)}>
            Rejoin Room
          </button>
        )}
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
  const navigate = useNavigate();
  const { ensureWalletSession } = useWalletSession();
  const [games, setGames] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [abandonedRefundRoom, setAbandonedRefundRoom] = useState(null);
  const {
    claimAbandonedMatchRefund,
    isPending: isAbandonedRefundPending,
    isConfirming: isAbandonedRefundConfirming,
    isSuccess: isAbandonedRefundSuccess
  } = useClaimAbandonedMatchRefund();

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

  const rejoinRoom = useCallback((roomCode) => {
    navigate('/game', {
      state: { gameMode: 'rejoin-staked', roomCode }
    });
  }, [navigate]);

  const loadActiveMatches = useCallback(async () => {
    try {
      setLoading(true);
      const token = await ensureWalletSession();
      const response = await fetch(`${BACKEND_URL}/games/active-staked`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Unable to load active staked matches');
      setActiveMatches(await response.json());
    } catch (error) {
      notify(error.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [ensureWalletSession, notify]);

  useEffect(() => {
    if (!isAbandonedRefundSuccess || !abandonedRefundRoom || !address) return;

    fetch(`${BACKEND_URL}/games/${abandonedRefundRoom}/refunded`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerAddress: address })
    })
      .then(response => {
        if (!response.ok) throw new Error('Refund succeeded, but game status did not update');
        setActiveMatches(current =>
          current.filter(match => match.roomCode !== abandonedRefundRoom)
        );
        setAbandonedRefundRoom(null);
        notify('Both stakes were refunded.', { type: 'success' });
      })
      .catch(error => notify(error.message, { type: 'error', duration: 0 }));
  }, [isAbandonedRefundSuccess, abandonedRefundRoom, address, notify]);

  if (!isConnected) {
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
        <button type="button" onClick={loadActiveMatches} disabled={loading}>
          Active Matches
        </button>
      </div>
      <div className="pending-stakes-list">
        {games.map(game => (
          <PendingStakeCard
            key={game.roomCode}
            game={game}
            playerAddress={address}
            onRefunded={handleRefunded}
            onRejoin={rejoinRoom}
          />
        ))}
        {activeMatches
          .filter(match => !games.some(game => game.roomCode === match.roomCode))
          .map(match => (
            <div className="pending-stake-card" key={match.roomCode}>
              <div>
                <strong>Room {match.roomCode}</strong>
                <span>{match.stakeAmount} {match.stakeCurrency || 'CELO'}</span>
              </div>
              <div className="pending-stake-action">
                {match.lifecyclePhase === 'abandoned' ? (
                  <button
                    type="button"
                    disabled={
                      !match.abandonmentSignature ||
                      isAbandonedRefundPending ||
                      isAbandonedRefundConfirming
                    }
                    onClick={() => claimAbandonedMatchRefund(
                      match.roomCode,
                      match.abandonmentSignature
                    ).then(() => setAbandonedRefundRoom(match.roomCode))}
                  >
                    {isAbandonedRefundPending
                      ? 'Confirm Refund'
                      : isAbandonedRefundConfirming
                        ? 'Refunding...'
                        : 'Refund Both Players'}
                  </button>
                ) : (
                  <button type="button" onClick={() => rejoinRoom(match.roomCode)}>
                    Rejoin Room
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
