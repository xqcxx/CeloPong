import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { BACKEND_URL, LOBBY_ROUTE, PRIZE_MULTIPLIER } from '../constants';
import { BLOCK_EXPLORER_URL } from '../contracts/PongEscrow';
import { useClaimPrize } from '../hooks/useContract';
import { createPaginationState, mergePages, shouldResetPagination } from '../utils';
import { addressesMatch, isLegacyMatch } from '../utils/resultProof';
import { useNotification } from './notifications/NotificationProvider';
import '../styles/GameHistory.css';

const sortByEndedAtDesc = (a, b) =>
  new Date(b?.endedAt || 0).getTime() - new Date(a?.endedAt || 0).getTime();

const GameHistory = ({ savedUsername }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const { notify } = useNotification();
  const initialFilter = new URLSearchParams(location.search).get('filter') === 'wins' ? 'wins' : 'all';
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [claimSummary, setClaimSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [stakedFilter, setStakedFilter] = useState(null);
  const [claimStatus, setClaimStatus] = useState('all');
  const [claimingGameId, setClaimingGameId] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [activeClaimHash, setActiveClaimHash] = useState(null);
  const [pagination, setPagination] = useState(createPaginationState(50));
  const {
    claimPrize,
    hash: claimTxHash,
    isPending: isClaimPending,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
    error: contractClaimError
  } = useClaimPrize();

  const fetchGameHistory = useCallback(async () => {
    if (!savedUsername) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        filter: activeFilter,
        claimStatus: activeFilter === 'wins' ? claimStatus : 'all',
        limit: pagination.limit,
        offset: pagination.offset
      });
      if (stakedFilter !== null) params.set('staked', stakedFilter);
      if (address) params.set('walletAddress', address);

      const response = await fetch(
        `${BACKEND_URL}/games/player/${encodeURIComponent(savedUsername)}/history?${params}`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `History request failed (${response.status})`);
      }

      const data = await response.json();
      const reset = shouldResetPagination(pagination.offset);
      setGames(current => reset
        ? [...(data.games || [])].sort(sortByEndedAtDesc)
        : mergePages(current, data.games, '_id', { comparator: sortByEndedAtDesc }));
      if (reset) {
        setStats(data.stats);
        setClaimSummary(data.claimSummary || {});
      }
      setPagination(data.pagination);
    } catch (requestError) {
      console.error('Error fetching game history:', requestError);
      setError(requestError.message || 'Failed to load game history.');
    } finally {
      setLoading(false);
    }
  }, [
    savedUsername,
    activeFilter,
    claimStatus,
    stakedFilter,
    address,
    pagination.limit,
    pagination.offset
  ]);

  useEffect(() => {
    if (savedUsername) fetchGameHistory();
    else setLoading(false);
  }, [savedUsername, fetchGameHistory]);

  useEffect(() => {
    if (!contractClaimError) return;
    const message = contractClaimError.shortMessage || contractClaimError.message || 'Claim failed.';
    setClaimError(message);
    notify(message, { type: 'error' });
  }, [contractClaimError, notify]);

  useEffect(() => {
    if (
      !isClaimSuccess ||
      !claimingGameId ||
      !claimTxHash ||
      claimTxHash !== activeClaimHash
    ) return;

    fetch(`${BACKEND_URL}/games/${claimingGameId}/claimed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: claimTxHash })
    })
      .then(response => {
        if (!response.ok && response.status !== 400) {
          throw new Error('Claim confirmed, but history could not be updated.');
        }
        setGames(current => current.map(game =>
          game._id === claimingGameId
            ? { ...game, claimed: true, claimTxHash }
            : game
        ));
        notify('Prize claimed', { type: 'success' });
        setClaimingGameId(null);
        setClaimError(null);
        setActiveClaimHash(null);
      })
      .catch(updateError => {
        setClaimError(updateError.message);
        notify(updateError.message, { type: 'error' });
      });
  }, [isClaimSuccess, claimingGameId, claimTxHash, activeClaimHash, notify]);

  const resetFilters = (changes) => {
    changes();
    setGames([]);
    setPagination(current => ({ ...current, offset: 0 }));
  };

  const handleClaim = async (game) => {
    if (!isConnected || !addressesMatch(address, game.winnerAddress)) {
      setClaimingGameId(game._id);
      setClaimError('Connect the wallet that won this match.');
      return;
    }
    if (isLegacyMatch(game) || !game.resultSignature) {
      setClaimingGameId(game._id);
      setClaimError('Legacy matches are display-only.');
      return;
    }

    setClaimingGameId(game._id);
    setClaimError(null);
    try {
      const result = await claimPrize({
        ...game,
        finalScore: [game.score?.player1 || 0, game.score?.player2 || 0]
      });
      if (result?.alreadyClaimed) {
        setGames(current => current.map(item =>
          item._id === game._id ? { ...item, claimed: true } : item
        ));
        setClaimingGameId(null);
        setActiveClaimHash(null);
      } else {
        setActiveClaimHash(result?.hash || null);
      }
    } catch (claimRequestError) {
      setClaimError(claimRequestError.shortMessage || claimRequestError.message || 'Claim failed.');
    }
  };

  const formatDate = value => value
    ? new Date(value).toLocaleString()
    : 'N/A';

  if (!savedUsername) {
    return (
      <div className="game-history-container">
        <div className="game-history-header">
          <button onClick={() => navigate(LOBBY_ROUTE)} className="back-button">Back</button>
          <h1>Game History</h1>
        </div>
        <div className="no-username-prompt">Set your username to view game history.</div>
      </div>
    );
  }

  return (
    <div className="game-history-container">
      <div className="game-history-header">
        <button onClick={() => navigate(LOBBY_ROUTE)} className="back-button">Back</button>
        <h1>Game History</h1>
        <p className="username-display">{savedUsername}</p>
      </div>

      {stats && (
        <div className="stats-section">
          <div className="stat-card"><span className="stat-label">Games</span><span className="stat-value">{stats.totalGames}</span></div>
          <div className="stat-card"><span className="stat-label">Record</span><span className="stat-value">{stats.wins}W - {stats.losses}L</span></div>
          <div className="stat-card"><span className="stat-label">Win Rate</span><span className="stat-value">{stats.winRate}%</span></div>
          <div className="stat-card"><span className="stat-label">Staked</span><span className="stat-value">{stats.stakedGames}</span></div>
        </div>
      )}

      {activeFilter === 'wins' && Object.keys(claimSummary).length > 0 && (
        <div className="claim-summary-grid">
          {Object.entries(claimSummary).map(([currency, summary]) => (
            <div className="claim-summary-card" key={currency}>
              <strong>{currency}</strong>
              <span>Claimable: {summary.claimable}</span>
              <span>Claimed: {summary.claimed}</span>
              <span>Total: {summary.total}</span>
            </div>
          ))}
        </div>
      )}

      <div className="filter-toolbar">
        <div className="filter-group">
          <span className="filter-group-label">Result:</span>
          {['all', 'wins', 'losses'].map(filter => (
            <button
              key={filter}
              className={`filter-button ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => resetFilters(() => {
                setActiveFilter(filter);
                if (filter !== 'wins') setClaimStatus('all');
              })}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Type:</span>
          {[
            ['all', null],
            ['staked', 'true'],
            ['casual', 'false']
          ].map(([label, value]) => (
            <button
              key={label}
              className={`filter-button ${stakedFilter === value ? 'active' : ''}`}
              onClick={() => resetFilters(() => setStakedFilter(value))}
            >
              {label}
            </button>
          ))}
        </div>
        {activeFilter === 'wins' && (
          <div className="filter-group">
            <span className="filter-group-label">Claims:</span>
            {['all', 'claimable', 'claimed'].map(status => (
              <button
                key={status}
                className={`filter-button ${claimStatus === status ? 'active' : ''}`}
                disabled={status !== 'all' && !address}
                onClick={() => resetFilters(() => setClaimStatus(status))}
              >
                {status}
              </button>
            ))}
          </div>
        )}
      </div>

      {claimingGameId && (
        <div className="claim-status-panel">
          {claimError ? (
            <>
              <span>{claimError}</span>
              <button onClick={() => {
                const game = games.find(item => item._id === claimingGameId);
                if (game) handleClaim(game);
              }}>Retry</button>
              <button onClick={() => {
                setClaimingGameId(null);
                setClaimError(null);
                setActiveClaimHash(null);
              }}>Close</button>
            </>
          ) : (
            <span>{isClaimPending ? 'Confirm in wallet...' : isClaimConfirming ? 'Confirming transaction...' : 'Preparing claim...'}</span>
          )}
        </div>
      )}

      <div className="games-content">
        {loading && games.length === 0 ? (
          <div className="loading">Loading game history...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : games.length === 0 ? (
          <div className="no-games"><p>No games found.</p></div>
        ) : (
          <>
            <div className="games-list" data-testid="history-list">
              {games.map(game => {
                const payout = Number(game.stakeAmount || 0) * PRIZE_MULTIPLIER;
                const legacy = isLegacyMatch(game);
                const correctWallet = addressesMatch(address, game.winnerAddress);
                const claimable = game.result === 'win' && game.isStaked && !game.claimed && !legacy && game.resultSignature;
                return (
                  <div key={game._id} className={`game-card ${game.result}`}>
                    <div className="game-header">
                      <div className="game-header-left">
                        <span className="room-code">Room: {game.roomCode}</span>
                        {game.isStaked && <span className="stake-badge">{game.stakeAmount} {game.stakeCurrency || 'CELO'}</span>}
                        {legacy && <span className="legacy-badge">Legacy match</span>}
                      </div>
                      <span className={`result-badge ${game.result}`}>{game.result}</span>
                    </div>
                    <div className="game-details">
                      <div className="detail-row"><span className="detail-label">Opponent:</span><span className="detail-value">{game.opponent || 'Unknown'}</span></div>
                      <div className="detail-row"><span className="detail-label">Final Score:</span><span className="detail-value score">{game.finalScore}</span></div>
                      {game.isStaked && <div className="detail-row"><span className="detail-label">Payout:</span><span className="detail-value">{payout} {game.stakeCurrency || 'CELO'}</span></div>}
                      <div className="detail-row"><span className="detail-label">Played:</span><span className="detail-value date">{formatDate(game.endedAt)}</span></div>
                      {game.claimed && (
                        <div className="claim-actions">
                          <span className="detail-value claimed">Claimed</span>
                          {game.claimTxHash && <a href={`${BLOCK_EXPLORER_URL}/tx/${game.claimTxHash}`} target="_blank" rel="noreferrer">View transaction</a>}
                        </div>
                      )}
                      {claimable && (
                        <div className="claim-actions">
                          {!correctWallet && <span className="wallet-warning">Connect winning wallet</span>}
                          <button
                            className="claim-button"
                            disabled={!correctWallet || claimingGameId === game._id}
                            onClick={() => handleClaim(game)}
                          >
                            {correctWallet ? 'Claim Prize' : 'Wrong Wallet'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="pagination-info">Showing {games.length} of {pagination.total} games</p>
            {pagination.hasMore && (
              <div className="load-more-section">
                <button
                  className="load-more-button"
                  disabled={loading}
                  onClick={() => setPagination(current => ({ ...current, offset: current.offset + current.limit }))}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GameHistory;
