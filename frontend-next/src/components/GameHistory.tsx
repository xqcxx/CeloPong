'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL, PRIZE_MULTIPLIER } from '../constants';
import { computePrizeFromStake, mergePages, shouldResetPagination, createPaginationState } from '../utils';
import '../styles/GameHistory.css';

const sortByEndedAtDesc = (a, b) => {
  const dateA = new Date(a?.endedAt || 0).getTime();
  const dateB = new Date(b?.endedAt || 0).getTime();
  return dateB - dateA;
};

const GameHistory = ({ savedUsername }) => {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [stakedFilter, setStakedFilter] = useState(null);
  const [pagination, setPagination] = useState(createPaginationState(50));
  const displayedCount = games.length;
  const remainingGames = Math.max(pagination.total - displayedCount, 0);
  const isFilteringStaked = stakedFilter !== null;
  const isLoadMoreDisabled = loading || !pagination.hasMore;
  const isInitialLoad = loading && displayedCount === 0;

  // Fetch game history
  const fetchGameHistory = useCallback(async () => {
    if (!savedUsername) return;

    try {
      setLoading(true);
      setError(null);

      const shouldReset = shouldResetPagination(pagination.offset);

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[GameHistory] fetching page', {
          offset: pagination.offset,
          limit: pagination.limit,
          filter: activeFilter,
          staked: stakedFilter
        });
      }

      const params = new URLSearchParams({
        filter: activeFilter,
        limit: String(pagination.limit),
        offset: String(pagination.offset)
      });

      if (stakedFilter !== null) {
        params.append('staked', stakedFilter);
      }

      const response = await fetch(
        `${BACKEND_URL}/games/player/${savedUsername}/history?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch game history: ${response.status}`);
      }

      const data = await response.json();
      let nextGamesSnapshot = [];
      setGames(prev => {
        if (shouldReset) {
          nextGamesSnapshot = [...(data.games || [])].sort(sortByEndedAtDesc);
          return nextGamesSnapshot;
        }
        nextGamesSnapshot = mergePages(prev, data.games, '_id', { comparator: sortByEndedAtDesc });
        return nextGamesSnapshot;
      });
      if (shouldReset) {
        setStats(data.stats);
      }
      setPagination({
        ...data.pagination,
        hasMore: data.pagination?.hasMore ?? nextGamesSnapshot.length < data.pagination.total
      });
    } catch (err) {
      console.error('Error fetching game history:', {
        error: err,
        offset: pagination.offset,
        limit: pagination.limit
      });
      setError('Failed to load game history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [savedUsername, activeFilter, stakedFilter, pagination.limit, pagination.offset]);

  useEffect(() => {
    if (savedUsername) {
      fetchGameHistory();
    } else {
      setLoading(false);
    }
  }, [savedUsername, fetchGameHistory]);

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleStakedFilterChange = (value) => {
    setStakedFilter(value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const loadMore = () => {
    if (isLoadMoreDisabled) {
      return;
    }
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (!savedUsername) {
    return (
      <div className="game-history-container">
        <div className="game-history-header">
          <button onClick={() => navigate('/')} className="back-button">← Back</button>
          <h1>Game History</h1>
        </div>
        <div className="no-username-prompt">
          <p>Please set your username to view game history</p>
          <button onClick={() => navigate('/')} className="go-home-button">
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-history-container">
      <div className="game-history-header">
        <button onClick={() => navigate('/')} className="back-button">← Back</button>
        <h1>Game History</h1>
        <p className="username-display">{savedUsername}</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="stats-section">
          <div className="stat-card">
            <span className="stat-label">Total Games</span>
            <span className="stat-value">{stats.totalGames}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Record</span>
            <span className="stat-value">{stats.wins}W - {stats.losses}L</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Win Rate</span>
            <span className="stat-value">{stats.winRate}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Staked</span>
            <span className="stat-value">{stats.stakedGames}</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-label">Earnings</span>
            <span className="stat-value">{stats.totalEarnings} ETH</span>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="filter-toolbar">
        <div className="filter-group">
          <span className="filter-group-label">Result:</span>
          <button
            className={`filter-button ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            All
          </button>
          <button
            className={`filter-button ${activeFilter === 'wins' ? 'active' : ''}`}
            onClick={() => handleFilterChange('wins')}
          >
            Wins
          </button>
          <button
            className={`filter-button ${activeFilter === 'losses' ? 'active' : ''}`}
            onClick={() => handleFilterChange('losses')}
          >
            Losses
          </button>
        </div>

        <div className="filter-group">
          <span className="filter-group-label">Type:</span>
          <button
            className={`filter-button ${stakedFilter === null ? 'active' : ''}`}
            onClick={() => handleStakedFilterChange(null)}
          >
            All
          </button>
          <button
            className={`filter-button ${stakedFilter === 'true' ? 'active' : ''}`}
            onClick={() => handleStakedFilterChange('true')}
          >
            Staked
          </button>
          <button
            className={`filter-button ${stakedFilter === 'false' ? 'active' : ''}`}
            onClick={() => handleStakedFilterChange('false')}
          >
            Casual
          </button>
          {isFilteringStaked && (
            <span className="filter-hint">Filtering by {stakedFilter === 'true' ? 'staked' : 'casual'} games</span>
          )}
        </div>
      </div>

      {/* Game List */}
      <div className="games-content">
        {isInitialLoad ? (
          <div className="loading">Loading game history...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : games.length === 0 ? (
          <div className="no-games">
            <p>No games found!</p>
            <p>Start playing to build your history</p>
            <button onClick={() => navigate('/')} className="play-button">
              Play Now
            </button>
          </div>
        ) : (
          <>
            <div className="games-list" data-testid="history-list">
              {games.map((game) => {
                const prizeInfo = computePrizeFromStake(game.stakeAmount, PRIZE_MULTIPLIER);
                return (
                <div key={game._id} className={`game-card ${game.result}`}>
                  <div className="game-header">
                    <div className="game-header-left">
                      <span className="room-code">Room: {game.roomCode}</span>
                      {game.isStaked && (
                        <span className="stake-badge" title={`Winner receives ${prizeInfo.formattedPayout} ETH`}>
                          💎 {game.stakeAmount} ETH (x{PRIZE_MULTIPLIER})
                        </span>
                      )}
                    </div>
                    <span className={`result-badge ${game.result}`}>
                      {game.result === 'win' ? '✅ Win' : game.result === 'loss' ? '❌ Loss' : '⚖️ Draw'}
                    </span>
                  </div>

                  <div className="game-details">
                    <div className="detail-row">
                      <span className="detail-label">Opponent:</span>
                      <span className="detail-value">{game.opponent || 'Unknown'}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Final Score:</span>
                      <span className="detail-value score">{game.finalScore}</span>
                    </div>

                    {game.isStaked && (
                      <div className="detail-row">
                        <span className="detail-label">Prize Payout:</span>
                        <span className="detail-value">{prizeInfo.formattedPayout} ETH</span>
                      </div>
                    )}

                    <div className="detail-row">
                      <span className="detail-label">Played At:</span>
                      <span className="detail-value date">{formatDate(game.endedAt)}</span>
                    </div>

                    {game.isStaked && (
                      <div className="detail-row">
                        <span className="detail-label">Prize Status:</span>
                        <span className={`detail-value ${game.claimed ? 'claimed' : 'unclaimed'}`}>
                          {game.claimed ? 'Claimed ✓' : 'Available 💰'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>

            {pagination.hasMore ? (
              <div className="load-more-section">
                <button
                  onClick={loadMore}
                  className="load-more-button"
                  disabled={isLoadMoreDisabled}
                  data-testid="history-load-more"
                >
                  {loading ? 'Loading...' : `Load More (${remainingGames} left)`}
                </button>
                {loading && !isInitialLoad && (
                  <p className="pagination-info">Fetching more games…</p>
                )}
                <p className="pagination-info" aria-live="polite">
                  Showing {displayedCount} of {pagination.total} games
                </p>
              </div>
            ) : (
              <p className="pagination-info">All games loaded.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GameHistory;
