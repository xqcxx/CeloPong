'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useClaimPrize } from '../hooks/useContract';
import { BLOCK_EXPLORER_URL } from '../contracts/PongEscrow';
import { BACKEND_URL, PRIZE_MULTIPLIER } from '../constants';
import { computePrizeFromStake, formatWeiToEth, sumWei, mergePages, shouldResetPagination, createPaginationState } from '../utils';
import '../styles/MyWins.css';

const sortWinsByEndedAt = (a, b) => {
  const dateA = new Date(a?.endedAt || 0).getTime();
  const dateB = new Date(b?.endedAt || 0).getTime();
  return dateB - dateA;
};

const MyWins = () => {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingGameId, setClaimingGameId] = useState(null);
  const [claimErrorMessage, setClaimErrorMessage] = useState(null);
  const [pagination, setPagination] = useState(createPaginationState(20));
  const [showClaimableOnly, setShowClaimableOnly] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(null);
  const displayedCount = wins.length;
  const remainingWins = Math.max(pagination.total - displayedCount, 0);
  const isLoadMoreDisabled = loading || !pagination.hasMore;

  const {
    claimPrize,
    hash: claimTxHash,
    isPending: isClaimPending,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
    error: claimError
  } = useClaimPrize();

  // Fetch user's wins
  const fetchWins = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[MyWins] fetching page', {
          limit: pagination.limit,
          offset: pagination.offset
        });
      }

      const shouldReset = shouldResetPagination(pagination.offset);

      const params = new URLSearchParams({
        address,
        limit: String(pagination.limit),
        offset: String(pagination.offset)
      });

      const response = await fetch(`${BACKEND_URL}/games/my-wins?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch wins: ${response.status}`);
      }

      const data = await response.json();
      setWins(prev => {
        if (shouldReset) {
          return [...(data.games || [])].sort(sortWinsByEndedAt);
        }
        return mergePages(prev, data.games, '_id', { comparator: sortWinsByEndedAt });
      });
      setPagination({
        ...data.pagination,
        hasMore: data.pagination?.hasMore ?? (data.pagination.offset + data.pagination.limit) < data.pagination.total
      });
    } catch (err) {
      console.error('Error fetching wins:', {
        error: err,
        offset: pagination.offset
      });
      setError('Failed to load your wins. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [address, pagination.limit, pagination.offset]);

  const loadMore = () => {
    if (isLoadMoreDisabled) {
      return;
    }
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchWins();
    } else {
      setLoading(false);
    }
  }, [isConnected, address, fetchWins]);

  // Handle claim success
  useEffect(() => {
    if (isClaimSuccess && claimTxHash && claimingGameId) {
      console.log('✅ Prize claimed successfully!');

      // Mark game as claimed in database
      fetch(`${BACKEND_URL}/games/${claimingGameId}/claimed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: claimTxHash })
      })
        .then(res => res.json())
        .then(data => {
          console.log('Game marked as claimed:', data);
          // Refresh wins list
          fetchWins();
        })
        .catch(err => {
          console.error('Failed to mark game as claimed:', err);
        });

      setClaimingGameId(null);
    }
  }, [isClaimSuccess, claimTxHash, claimingGameId, fetchWins]);

  // Helper function to parse error messages
  const getErrorMessage = (error) => {
    if (!error) return 'Unknown error occurred';

    const errorString = error.message || error.toString();

    // User rejected the transaction
    if (errorString.includes('User rejected') ||
        errorString.includes('User denied') ||
        errorString.includes('user rejected') ||
        error.name === 'UserRejectedRequestError') {
      return 'Transaction cancelled';
    }

    // Insufficient funds
    if (errorString.includes('insufficient funds')) {
      return 'Insufficient funds in your wallet';
    }

    // Generic transaction failure
    return 'Transaction failed. Please try again.';
  };

  // Handle claim error
  useEffect(() => {
    if (claimError) {
      console.error('Claim error:', claimError);
      setClaimErrorMessage(getErrorMessage(claimError));
      setClaimingGameId(null);
    }
  }, [claimError]);

  const handleClaimPrize = async (game) => {
    if (!game.winnerSignature) {
      setClaimErrorMessage('Signature not available yet. Please try again later.');
      setClaimingGameId(game._id);
      return;
    }

    console.log('🎁 Claiming prize for room:', game.roomCode);
    setClaimingGameId(game._id);
    setClaimErrorMessage(null); // Clear any previous errors

    try {
      await claimPrize(game.roomCode, game.winnerSignature);
    } catch (error) {
      console.error('Error initiating claim:', error);
      setClaimingGameId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const handleCopyRoomCode = async (roomCode) => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedRoom(roomCode);
      setTimeout(() => setCopiedRoom(null), 2000);
    } catch (err) {
      console.error('Failed to copy room code', err);
    }
  };

  const winsWithPrize = useMemo(
    () =>
      wins.map((game) => ({
        ...game,
        prizeInfo: computePrizeFromStake(game.stakeAmount, PRIZE_MULTIPLIER),
      })),
    [wins]
  );

  const filteredWins = useMemo(
    () => winsWithPrize.filter((game) => (showClaimableOnly ? !game.claimed : true)),
    [winsWithPrize, showClaimableOnly]
  );

  const prizeTotals = useMemo(() => {
    return winsWithPrize.reduce(
      (acc, game) => {
        const payout = game.prizeInfo.payoutWei;
        if (game.claimed) {
          acc.claimed += payout;
        } else {
          acc.claimable += payout;
        }
        return acc;
      },
      { claimable: 0n, claimed: 0n }
    );
  }, [winsWithPrize]);

  const totalPrizeWei = useMemo(
    () => sumWei(winsWithPrize.map((game) => game.prizeInfo.payoutWei)),
    [winsWithPrize]
  );

  const claimableCount = useMemo(
    () => winsWithPrize.filter((game) => !game.claimed).length,
    [winsWithPrize]
  );

  const formattedTotals = useMemo(() => {
    return {
      claimable: formatWeiToEth(prizeTotals.claimable),
      claimed: formatWeiToEth(prizeTotals.claimed),
      total: formatWeiToEth(totalPrizeWei),
    };
  }, [prizeTotals, totalPrizeWei]);

  if (!isConnected) {
    return (
      <div className="my-wins-container">
        <div className="my-wins-header">
          <button onClick={() => navigate('/')} className="back-button">← Back</button>
          <h1>My Wins</h1>
        </div>
        <div className="connect-wallet-prompt">
          <p>Please connect your wallet to view your wins</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-wins-container">
      <div className="my-wins-header">
        <button onClick={() => navigate('/')} className="back-button">← Back</button>
        <h1>My Wins</h1>
        <p className="wallet-address">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
      </div>

      <div className="wins-summary">
        <div className="summary-card claimable" data-testid="claimable-total">
          <span className="summary-label">Claimable</span>
          <span className="summary-value">{formattedTotals.claimable} ETH</span>
        </div>
        <div className="summary-card claimed" data-testid="claimed-total">
          <span className="summary-label">Claimed</span>
          <span className="summary-value">{formattedTotals.claimed} ETH</span>
        </div>
        <div className="summary-card total" data-testid="total-won">
          <span className="summary-label">Total Won</span>
          <span className="summary-value">{formattedTotals.total} ETH</span>
        </div>
      </div>
      <p className="summary-note">
        Totals reflect {PRIZE_MULTIPLIER}× stake payouts. {claimableCount > 0 ? `${claimableCount} win(s) ready to claim.` : 'All wins have been claimed.'}
      </p>

      {/* Transaction Progress Modal */}
      {claimingGameId && (
        <div className="transaction-overlay">
          <div className="transaction-modal">
            {claimErrorMessage ? (
              <>
                <h3 style={{ color: '#ff6b6b', marginBottom: '20px' }}>Transaction Failed</h3>
                <div style={{
                  background: 'rgba(255, 107, 107, 0.1)',
                  border: '1px solid #ff6b6b',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '20px',
                  color: '#ff6b6b',
                  fontSize: '0.9rem'
                }}>
                  {claimErrorMessage}
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      const game = wins.find(w => w._id === claimingGameId);
                      if (game) {
                        handleClaimPrize(game);
                      }
                    }}
                    style={{
                      padding: '12px 24px',
                      background: 'rgb(116,113,203)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontFamily: 'Press Start 2P, monospace',
                      fontSize: '0.8rem'
                    }}
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => {
                      setClaimingGameId(null);
                      setClaimErrorMessage(null);
                    }}
                    style={{
                      padding: '12px 24px',
                      background: '#444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontFamily: 'Press Start 2P, monospace',
                      fontSize: '0.8rem'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>
                  {isClaimPending && 'Confirm Transaction in Wallet...'}
                  {isClaimConfirming && 'Claiming Prize...'}
                </h3>
                <div className="transaction-spinner"></div>
                <p>
                  {isClaimPending && 'Please confirm the transaction in your wallet'}
                  {isClaimConfirming && 'Waiting for blockchain confirmation'}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="wins-content">
        {loading && pagination.offset === 0 ? (
          <div className="loading">Loading your wins...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : filteredWins.length === 0 ? (
          <div className="no-wins">
            <p>{showClaimableOnly ? 'No claimable wins!' : 'No wins yet!'}</p>
            <p>{showClaimableOnly ? 'Great job claiming everything.' : 'Play some staked matches to win prizes'}</p>
            {showClaimableOnly ? (
              <button onClick={() => setShowClaimableOnly(false)} className="play-button">
                Show All Wins
              </button>
            ) : (
              <button onClick={() => navigate('/')} className="play-button">
                Play Now
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="wins-toolbar">
              <label className="toggle" data-testid="claimable-toggle">
                <input
                  type="checkbox"
                  checked={showClaimableOnly}
                  onChange={(e) => setShowClaimableOnly(e.target.checked)}
                />
                Show claimable only
              </label>
            </div>
            <div className="wins-list">
              {filteredWins.map((game) => {
                const prize = game.prizeInfo;
                return (
                  <div key={game._id} className={`win-card ${game.claimed ? 'claimed' : 'claimable'}`}>
                    <div className="win-header">
                      <span className="room-code">
                        Room: {game.roomCode}
                        <button
                          className="copy-room-button"
                          onClick={() => handleCopyRoomCode(game.roomCode)}
                        >
                          {copiedRoom === game.roomCode ? 'Copied!' : 'Copy'}
                        </button>
                      </span>
                      <span className={`status-badge ${game.claimed ? 'claimed' : 'unclaimed'}`}>
                        {game.claimed ? '✅ Claimed' : '💎 Claimable'}
                      </span>
                    </div>

                    <div className="win-details">
                      <div className="detail-row">
                        <span className="detail-label">Prize Amount:</span>
                        <span className="detail-value prize-amount" data-testid="prize-amount">
                          {prize.formattedPayout} ETH
                          <span className="prize-note">
                            stake {prize.formattedStake} ETH ×{Number(prize.multiplier)}
                          </span>
                        </span>
                      </div>

                    <div className="detail-row">
                      <span className="detail-label">Final Score:</span>
                      <span className="detail-value">
                        {game.score && game.score.player1 !== undefined && game.score.player2 !== undefined
                          ? `${game.score.player1} - ${game.score.player2}`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Won At:</span>
                      <span className="detail-value">
                        {formatDate(game.endedAt)}
                      </span>
                    </div>

                    {game.claimed && game.claimTxHash && (
                      <div className="detail-row">
                        <span className="detail-label">Claim Tx:</span>
                        <span className="detail-value tx-hash">
                          <a
                            href={`${BLOCK_EXPLORER_URL}/tx/${game.claimTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {game.claimTxHash.slice(0, 10)}...{game.claimTxHash.slice(-8)}
                          </a>
                        </span>
                      </div>
                    )}
                    </div>

                    {!game.claimed && (
                      <button
                        onClick={() => handleClaimPrize(game)}
                        className="claim-button"
                        disabled={claimingGameId === game._id || !game.winnerSignature}
                      >
                        {!game.winnerSignature
                          ? 'Signature Pending...'
                          : `Claim ${prize.formattedPayout} ETH`}
                      </button>
                    )}
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
                  data-testid="wins-load-more"
                >
                  {loading ? 'Loading...' : `Load More (${remainingWins} left)`}
                </button>
                <p className="pagination-info">
                  Showing {displayedCount} of {pagination.total} wins
                </p>
              </div>
            ) : (
              <p className="pagination-info">All {displayedCount} wins loaded.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyWins;
