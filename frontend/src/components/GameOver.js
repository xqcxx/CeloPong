import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import io from 'socket.io-client';
import { BACKEND_URL, REMATCH_ROUTE } from '../constants';
import { useClaimPrize, useGG, useReportMatch } from '../hooks/useContract';
import { BLOCK_EXPLORER_URL } from '../contracts/PongEscrow';
import '../styles/GameOver.css';
import { useNotification } from './notifications/NotificationProvider';
import { isLegacyMatch } from '../utils/resultProof';

const REMATCH_REQUEST_EVENT = 'requestRematch';
const REMATCH_RESPONSE_EVENT = 'rematchResponse';
const REMATCH_REQUESTED_EVENT = 'rematchRequested';
const REMATCH_DECLINED_EVENT = 'rematchDeclined';
const GAME_START_EVENT = 'gameStart';
const DEFAULT_SCORE = [0, 0];
const WAITING_TEXT = 'Waiting for opponent...';
const addressesMatch = (first, second) =>
  Boolean(first && second && first.toLowerCase() === second.toLowerCase());

const GameOver = ({ savedUsername }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const result = location.state;
  const message = result?.message || 'Game Over';
  const finalScore = Array.isArray(result?.finalScore) ? result.finalScore : DEFAULT_SCORE;
  const stats = result?.stats || {};
  const rating = result?.rating ?? '—';
  const socketRef = useRef(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [rematchResponded, setRematchResponded] = useState(false);

  // Claim prize hooks
  const { address, isConnected } = useAccount();
  const {
    claimPrize,
    hash: claimTxHash,
    isPending: isClaimPending,
    isSuccess: isClaimSuccess,
    error: claimError
  } = useClaimPrize();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimErrorMessage, setClaimErrorMessage] = useState(null);
  const [activeClaimHash, setActiveClaimHash] = useState(null);

  // Engagement hooks
  const { sendGG, isPending: isGGPending, isSuccess: isGGSuccess, error: ggError } = useGG();
  const { reportMatch, isPending: isReportPending, isSuccess: isReportSuccess, error: reportError } = useReportMatch();
  const [ggSent, setGGSent] = useState(false);

  const isStaked = result?.isStaked || false;
  const isWinner = result?.isWinner || false;
  const isWinningWallet = addressesMatch(address, result?.winnerAddress);
  const hasResultProof = isStaked && result?.resultSignature && !isLegacyMatch(result);
  const canClaim = hasResultProof && isWinner;

  const markGameClaimed = useCallback(async (txHash) => {
    const gameResponse = await fetch(`${BACKEND_URL}/games/${result.roomCode}`);
    if (!gameResponse.ok) {
      throw new Error('Prize was claimed, but the game record could not be found.');
    }

    const game = await gameResponse.json();
    const claimedResponse = await fetch(`${BACKEND_URL}/games/${game._id}/claimed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash })
    });

    if (!claimedResponse.ok && claimedResponse.status !== 400) {
      throw new Error('Prize was claimed, but the game record could not be updated.');
    }
  }, [result?.roomCode]);

  useEffect(() => {
    if (!result) {
      navigate('/');
      return;
    }

    const username = savedUsername;
    if (!username) {
      navigate('/');
      return;
    }

    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket'],
      path: '/socket.io/',
      query: { username }
    });

    socketRef.current = socket;

    socket.on(REMATCH_REQUESTED_EVENT, () => {
      setRematchRequested(true);
      setWaitingForResponse(false);
      setRematchResponded(false);
    });

    const goToRematch = () => {
      // Navigate to existing /game route (no /multiplayer route is registered)
      setWaitingForResponse(false);
      setRematchRequested(false);
      navigate(REMATCH_ROUTE, {
        state: {
          gameMode: 'rematch',
          rematch: true
        }
      });
    };

    socket.on(GAME_START_EVENT, goToRematch);

    socket.on(REMATCH_DECLINED_EVENT, () => {
      notify('Opponent declined rematch', { type: 'info' });
      setWaitingForResponse(false);
      setRematchRequested(false);
    });

    return () => {
      socket.off(GAME_START_EVENT, goToRematch);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [result, navigate, notify, savedUsername]);

  const handleClaimPrize = useCallback(async () => {
    if (!hasResultProof) return;
    if (!isWinningWallet) {
      setClaimErrorMessage('Connect the wallet that won this match before claiming.');
      return;
    }

    setClaiming(true);
    setClaimErrorMessage(null);
    try {
      const claimResult = await claimPrize({ ...result, finalScore });

      if (claimResult?.alreadyClaimed) {
        await markGameClaimed();
        setClaimed(true);
        setClaiming(false);
      } else {
        setActiveClaimHash(claimResult?.hash || null);
      }
    } catch (error) {
      console.error('Claim error:', error);
      setClaimErrorMessage(error.shortMessage || error.message || 'Claim failed');
      setClaiming(false);
    }
  }, [result, finalScore, hasResultProof, claimPrize, isWinningWallet, markGameClaimed]);

  useEffect(() => {
    if (isGGSuccess) {
      setGGSent(true);
      notify('GG sent', { type: 'success' });
    }
  }, [isGGSuccess, notify]);

  useEffect(() => {
    if (ggError) notify(ggError.shortMessage || ggError.message || 'GG failed', { type: 'error' });
  }, [ggError, notify]);

  useEffect(() => {
    if (isReportSuccess) notify('Score reported', { type: 'success' });
  }, [isReportSuccess, notify]);

  useEffect(() => {
    if (reportError) notify(reportError.shortMessage || reportError.message || 'Score report failed', { type: 'error' });
  }, [reportError, notify]);

  // Handle claim success
  useEffect(() => {
    if (isClaimSuccess && claiming && claimTxHash && claimTxHash === activeClaimHash) {
      setClaimed(true);
      setClaiming(false);
      setActiveClaimHash(null);
      markGameClaimed(claimTxHash).catch(error => {
        console.error('Failed to mark game as claimed:', error);
      });
    }
  }, [isClaimSuccess, claiming, claimTxHash, activeClaimHash, markGameClaimed]);

  // Handle claim error
  useEffect(() => {
    if (claimError && claiming) {
      const msg = claimError.message || String(claimError);
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setClaimErrorMessage('Transaction cancelled');
      } else {
        setClaimErrorMessage('Claim failed. Please try again.');
      }
      setClaiming(false);
    }
  }, [claimError, claiming]);

  if (!result) {
    return null;
  }

  const handleRematch = () => {
    if (socketRef.current) {
      socketRef.current.emit(REMATCH_REQUEST_EVENT);
      setWaitingForResponse(true);
    }
  };

  const handleAcceptRematch = () => {
    if (socketRef.current) {
      socketRef.current.emit(REMATCH_RESPONSE_EVENT, { accepted: true });
      setWaitingForResponse(true);
      setRematchRequested(false);
      setRematchResponded(true);
    }
  };

  const handleDeclineRematch = () => {
    if (socketRef.current) {
      socketRef.current.emit(REMATCH_RESPONSE_EVENT, { accepted: false });
      setRematchRequested(false);
      setRematchResponded(true);
    }
  };

  const handleGoHome = () => {
    if (socketRef.current) {
      socketRef.current.emit('leaveRoom');
      socketRef.current.disconnect();
    }
    setRematchRequested(false);
    setWaitingForResponse(false);
    setRematchResponded(false);
    navigate('/');
  };

  return (
    <div className="game-over">
      <h1>{message}</h1>
      <div className="stats">
        <p>Final Score: {finalScore[0]} - {finalScore[1]}</p>
        <p>New Rating: {rating}</p>
        <p>Game Duration: {Math.round((stats.duration || 0) / 1000)}s</p>
        <p>Total Hits: {stats.hits || 0}</p>
        {isStaked && (
          <p style={{ color: '#fdd040', marginTop: '10px' }}>
            {result?.stakeAmount} {result?.stakeCurrency || 'CELO'} staked
          </p>
        )}
      </div>

      {/* Claim Prize Section — only for staked winners */}
      {canClaim && (
        <div className="claim-section" style={{ margin: '20px 0', padding: '20px', background: 'rgba(123,63,228,0.15)', borderRadius: '12px', border: '1px solid #7b3fe4' }}>
          <h3 style={{ color: '#fdd040', marginBottom: '10px' }}>Prize: {result?.stakeAmount ? (parseFloat(result.stakeAmount) * 2).toString() : '0'} {result?.stakeCurrency || 'CELO'}</h3>
          {claimErrorMessage && (
            <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: 8, padding: 10, marginBottom: 12, color: '#ff6b6b', fontSize: '0.85rem' }}>
              {claimErrorMessage}
            </div>
          )}
          {!isWinningWallet && (
            <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: 8, padding: 10, marginBottom: 12, color: '#ff6b6b', fontSize: '0.85rem' }}>
              Connect winning wallet {result?.winnerAddress?.slice(0, 6)}...{result?.winnerAddress?.slice(-4)} to claim.
            </div>
          )}
          {claimed ? (
            <div style={{ color: '#45CD85', fontSize: '0.9rem' }}>
              Prize claimed!
              {claimTxHash && (
                <a href={`${BLOCK_EXPLORER_URL}/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#7b3fe4', marginLeft: 8, fontSize: '0.8rem' }}>
                  View tx
                </a>
              )}
            </div>
          ) : (
            <button
              onClick={handleClaimPrize}
              disabled={claiming || !isWinningWallet}
              style={{
                padding: '14px 32px', background: '#7b3fe4', color: '#fff',
                border: 'none', borderRadius: 8, cursor: claiming ? 'wait' : 'pointer',
                opacity: isWinningWallet ? 1 : 0.5,
                fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem'
              }}
            >
              {!isWinningWallet
                ? 'Wrong Wallet'
                : claiming
                  ? (isClaimPending ? 'Confirm in Wallet...' : 'Confirming...')
                  : 'Claim Prize'}
            </button>
          )}
        </div>
      )}

      {/* Show stake info for staked losers */}
      {isStaked && !isWinner && (
        <div style={{ margin: '15px 0', padding: '15px', background: 'rgba(255,107,107,0.1)', borderRadius: 8, color: '#ff6b6b', fontSize: '0.85rem' }}>
          {result?.stakeAmount} {result?.stakeCurrency || 'CELO'} lost — better luck next time!
        </div>
      )}

      {/* Engagement Buttons — GG + Report Score */}
      {isConnected && hasResultProof && (
        <div style={{ margin: '16px 0', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!ggSent && !isGGSuccess && (
            <button
              onClick={() => sendGG({ ...result, finalScore }).catch(() => {})}
              disabled={isGGPending}
              style={{
                padding: '8px 18px', background: '#35D07F', color: '#000', border: 'none',
                borderRadius: 6, cursor: isGGPending ? 'wait' : 'pointer',
                fontFamily: '"Press Start 2P", monospace', fontSize: '0.65rem'
              }}
            >
              {isGGSuccess ? 'GG Sent!' : isGGPending ? '...' : 'GG'}
            </button>
          )}
          {isGGSuccess && (
            <span style={{ padding: '8px 18px', color: '#35D07F', fontSize: '0.7rem', fontFamily: '"Press Start 2P", monospace' }}>
              GG Sent!
            </span>
          )}

          {!isReportSuccess ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: '#fdd040', fontSize: '0.7rem' }}>
                {finalScore[0]} - {finalScore[1]}
              </span>
              <button
                onClick={() => reportMatch({ ...result, finalScore }).catch(() => {})}
                disabled={isReportPending}
                style={{
                  padding: '6px 12px', background: '#7b3fe4', color: '#fff', border: 'none',
                  borderRadius: 6, cursor: isReportPending ? 'wait' : 'pointer',
                  fontFamily: '"Press Start 2P", monospace', fontSize: '0.6rem'
                }}
              >
                {isReportPending ? '...' : 'Report Score'}
              </button>
            </div>
          ) : (
            <span style={{ padding: '8px 18px', color: '#7b3fe4', fontSize: '0.7rem', fontFamily: '"Press Start 2P", monospace' }}>
              Score Reported!
            </span>
          )}
        </div>
      )}

      {rematchRequested && (
        <div className="rematch-request">
          <p>Opponent wants a rematch!</p>
          <div className="button-group">
            <button onClick={handleAcceptRematch} className="accept-btn" disabled={waitingForResponse || rematchResponded}>
              Accept Rematch
            </button>
            <button onClick={handleDeclineRematch} className="decline-btn" disabled={waitingForResponse || rematchResponded}>
              Decline
            </button>
          </div>
        </div>
      )}

      {!rematchRequested && (
        <div className="button-group">
          {waitingForResponse && <p>{WAITING_TEXT}</p>}
          {rematchResponded && !waitingForResponse && <p>Response sent</p>}
          <button
            onClick={handleRematch}
            disabled={waitingForResponse || rematchResponded}
            className="rematch-btn"
          >
            {waitingForResponse ? WAITING_TEXT : 'Request Rematch'}
          </button>
          <button onClick={handleGoHome} className="home-btn">
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
};

export default GameOver; 
