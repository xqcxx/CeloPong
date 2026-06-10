import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import io from 'socket.io-client';
import '../styles/Game.css';
import { BACKEND_URL, INITIAL_RATING } from '../constants';
import soundManager from '../utils/soundManager';
import { useStakeAsPlayer2, useApproveToken } from '../hooks/useContract';
import { CURRENCIES, isNativeToken } from '../config/currencies';
import { PONG_ESCROW_ADDRESS } from '../contracts/PongEscrow';

const MultiplayerGame = ({ username }) => {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [isWaiting, setIsWaiting] = useState(true);
  const [roomCode, setRoomCode] = useState(null);
  const [gameData, setGameData] = useState({
    score: [0, 0],
    ballPos: { x: 0, y: 0 },
    paddles: {
      player1: { y: 0 },
      player2: { y: 0 }
    },
    players: []
  });
  const [isPaused, setIsPaused] = useState(false);
  const [pausedBy, setPausedBy] = useState(null);
  const [pausesRemaining, setPausesRemaining] = useState(2);
  const [showRematchRequest, setShowRematchRequest] = useState(false);
  const [rematchRequester, setRematchRequester] = useState(null);
  const [showPlayer2StakingModal, setShowPlayer2StakingModal] = useState(false);
  const [stakingData, setStakingData] = useState(null);
  const [isPlayer2Staking, setIsPlayer2Staking] = useState(false);
  const [stakingErrorMessage, setStakingErrorMessage] = useState(null);
  const [isCursorHidden, setIsCursorHidden] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const prevGameDataRef = useRef(null);
  const isMounted = useRef(false);
  const cursorTimeoutRef = useRef(null);

  // Keyboard control state
  const [keyboardPaddleY, setKeyboardPaddleY] = useState(0);
  const keysPressed = useRef({ ArrowUp: false, ArrowDown: false });
  const keyboardIntervalRef = useRef(null);

  // Web3 hooks
  const { address, isConnected } = useAccount();
  const {
    stakeAsPlayer2,
    hash: player2StakingTxHash,
    isPending: isPlayer2StakingPending,
    isConfirming: isPlayer2StakingConfirming,
    isSuccess: isPlayer2StakingSuccess,
    error: player2StakingError
  } = useStakeAsPlayer2();

  const {
    approve: approveToken,
    isPending: isApprovalPending,
    isConfirming: isApprovalConfirming
  } = useApproveToken();

  const gameMode = location.state?.gameMode || 'quick';
  const joinRoomCode = location.state?.roomCode;

  const drawGame = useCallback((ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (isWaiting) {
      ctx.font = '24px "Press Start 2P"';
      ctx.fillStyle = 'rgb(116,113,203)';
      ctx.textAlign = 'center';
      const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);

      if (roomCode) {
        ctx.fillText(`Room Code: ${roomCode}`, ctx.canvas.width / 2, ctx.canvas.height / 2 - 30);
        ctx.fillText(`Waiting for opponent${dots}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 30);
      } else {
        ctx.fillText(`Waiting for opponent${dots}`, ctx.canvas.width / 2, ctx.canvas.height / 2);
      }
      return;
    }

    const { width, height } = ctx.canvas;
    ctx.imageSmoothingEnabled = true;

    ctx.fillStyle = 'rgb(116,113,203)';
    const paddleWidth = width * 0.02;
    const paddleHeight = height * 0.2;

    Object.values(gameData.paddles).forEach((paddle, index) => {
      const x = index === 0 ? paddleWidth : width - paddleWidth * 2;
      const y = (paddle.y + 1) * height / 2 - paddleHeight / 2;
      ctx.fillRect(x, y, paddleWidth, paddleHeight);
    });

    ctx.fillStyle = 'rgb(253,208,64)';
    const ballSize = width * 0.02;
    const ballX = (gameData.ballPos.x + 1) * width / 2 - ballSize / 2;
    const ballY = (gameData.ballPos.y + 1) * height / 2 - ballSize / 2;
    ctx.beginPath();
    ctx.arc(ballX + ballSize/2, ballY + ballSize/2, ballSize/2, 0, Math.PI * 2);
    ctx.fill();
  }, [gameData, isWaiting, roomCode]);

  // Cursor auto-hide management
  const resetCursorTimeout = useCallback(() => {
    // Clear existing timeout
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current);
    }

    // Show cursor
    setIsCursorHidden(false);

    // Set new timeout to hide cursor after 3 seconds
    cursorTimeoutRef.current = setTimeout(() => {
      setIsCursorHidden(true);
    }, 3000);
  }, []);

  const handleMouseMove = useCallback((e) => {
    // Reset cursor timeout on mouse move
    resetCursorTimeout();

    if (!socketRef.current || isWaiting) return;

    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const relativeY = ((e.clientY - bounds.top) / bounds.height) * 2 - 1;
    const clampedY = Math.max(-1, Math.min(1, relativeY));

    socketRef.current.emit('paddleMove', { position: clampedY });
  }, [isWaiting, resetCursorTimeout]);

  const handleTouchMove = useCallback((e) => {
    if (!socketRef.current || isWaiting) return;

    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();

    if (e.touches && e.touches.length > 0) {
      const touchY = e.touches[0].clientY;
      const relativeY = ((touchY - bounds.top) / bounds.height) * 2 - 1;
      const clampedY = Math.max(-1, Math.min(1, relativeY));

      socketRef.current.emit('paddleMove', { position: clampedY });
    }
  }, [isWaiting]);

  // Keyboard controls
  const handleKeyDown = useCallback((e) => {
    if (isWaiting || !socketRef.current) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); // Prevent page scrolling
      keysPressed.current[e.key] = true;

      // Start keyboard movement if not already running
      if (!keyboardIntervalRef.current) {
        keyboardIntervalRef.current = setInterval(() => {
          setKeyboardPaddleY((prevY) => {
            const MOVE_SPEED = 0.05; // Adjust speed as needed
            let newY = prevY;

            if (keysPressed.current.ArrowUp) {
              newY -= MOVE_SPEED;
            }
            if (keysPressed.current.ArrowDown) {
              newY += MOVE_SPEED;
            }

            // Clamp position between -1 and 1
            newY = Math.max(-1, Math.min(1, newY));

            // Emit paddle position to server
            if (socketRef.current) {
              socketRef.current.emit('paddleMove', { position: newY });
            }

            return newY;
          });
        }, 16); // ~60fps
      }
    }
  }, [isWaiting]);

  const handleKeyUp = useCallback((e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      keysPressed.current[e.key] = false;

      // Stop keyboard movement if no keys are pressed
      if (!keysPressed.current.ArrowUp && !keysPressed.current.ArrowDown) {
        if (keyboardIntervalRef.current) {
          clearInterval(keyboardIntervalRef.current);
          keyboardIntervalRef.current = null;
        }
      }
    }
  }, []);

  const handlePauseGame = useCallback(() => {
    if (socketRef.current && !isPaused) {
      socketRef.current.emit('pauseGame');
    }
  }, [isPaused]);

  const handleForfeitGame = useCallback(() => {
    if (window.confirm('Are you sure you want to forfeit? You will lose the game.')) {
      if (socketRef.current) {
        socketRef.current.emit('forfeitGame');
      }
    }
  }, []);

  const handleRematchResponse = useCallback((accepted) => {
    if (socketRef.current) {
      socketRef.current.emit('rematchResponse', { accepted });
      setShowRematchRequest(false);
      setRematchRequester(null);
    }
  }, []);

  const handlePlayer2Stake = useCallback(async () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    if (!stakingData) {
      alert('No staking data available');
      return;
    }

    console.log('💎 Player2 initiating stake:', stakingData);
    setStakingErrorMessage(null);
    setIsPlayer2Staking(true);

    const currency = CURRENCIES[stakingData.stakeCurrency] || CURRENCIES.CELO;

    try {
      // For ERC-20, approve first
      if (!isNativeToken(currency.tokenAddress)) {
        const amountWei = parseUnits(stakingData.stakeAmount, currency.decimals);
        await approveToken(currency.tokenAddress, PONG_ESCROW_ADDRESS, amountWei);
      }
      await stakeAsPlayer2(stakingData.roomCode, currency, stakingData.stakeAmount);
    } catch (error) {
      console.error('Error initiating Player2 stake:', error);
      setIsPlayer2Staking(false);
    }
  }, [isConnected, stakingData, stakeAsPlayer2, approveToken]);

  // Handle successful Player2 staking transaction
  useEffect(() => {
    console.log('🔍 Player2 Staking useEffect:', {
      isPlayer2StakingSuccess,
      player2StakingTxHash,
      stakingData,
      address
    });

    if (isPlayer2StakingSuccess && player2StakingTxHash && stakingData) {
      console.log('✅ Player2 staking successful! Updating game record...');

      fetch(`${BACKEND_URL}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: stakingData.roomCode,
          player2: { name: username, rating: 800 },
          player2Address: address,
          player2TxHash: player2StakingTxHash,
          stakeCurrency: stakingData.stakeCurrency || 'CELO',
          status: 'ready'
        })
      })

      if (socketRef.current) {
        socketRef.current.emit('player2StakeCompleted', {
          roomCode: stakingData.roomCode
        });
      }

      setIsPlayer2Staking(false);
      setShowPlayer2StakingModal(false);
      setStakingData(null);
    }
  }, [isPlayer2StakingSuccess, player2StakingTxHash, stakingData, username, address]);

  // Handle Player2 staking errors
  useEffect(() => {
    if (player2StakingError) {
      console.error('Player2 staking error:', player2StakingError);
      setIsPlayer2Staking(false);

      // Extract a user-friendly error message
      let errorMsg = 'Transaction failed. Please try again.';
      if (player2StakingError.message) {
        if (player2StakingError.message.includes('User rejected')) {
          errorMsg = 'Transaction was rejected. Please try again when ready.';
        } else if (player2StakingError.message.includes('insufficient funds')) {
          errorMsg = 'Insufficient funds in your wallet.';
        } else {
          errorMsg = player2StakingError.message;
        }
      }

      setStakingErrorMessage(errorMsg);
    }
  }, [player2StakingError]);

  const setupSocket = useCallback(() => {
    if (!isMounted.current || !username) return;

    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket'],
      path: '/socket.io/',
      query: { username }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected:', socket.id);

      const playerData = {
        name: username,
        rating: INITIAL_RATING,
        socketId: socket.id
      };

      if (gameMode === 'create' || gameMode === 'create-staked') {
        const specificRoomCode = location.state?.roomCode;
        socket.emit('createRoom', playerData, specificRoomCode);
      } else if (gameMode === 'join' && joinRoomCode) {
        socket.emit('joinRoom', { roomCode: joinRoomCode, player: playerData });
      } else {
        socket.emit('findRandomMatch', playerData);
      }
    });

    socket.on('roomCreated', (data) => {
      console.log('Room created:', data.roomCode);
      setRoomCode(data.roomCode);
      setIsWaiting(true);
    });

    socket.on('waitingForOpponent', (data) => {
      console.log('Waiting for opponent:', data.roomCode);
      setRoomCode(data.roomCode);
      setIsWaiting(true);
    });

    socket.on('roomReady', (data) => {
      console.log('Room ready:', data);
      setIsWaiting(true);
    });

    socket.on('stakedMatchJoined', (data) => {
      console.log('💎 Staked match joined! Player2 needs to stake:', data);
      setStakingData(data);
      setShowPlayer2StakingModal(true);
    });

    socket.on('waitingForPlayer2Stake', (data) => {
      console.log('⏳ Waiting for Player2 to stake:', data);
      setIsWaiting(true);
      // Update the waiting message to indicate we're waiting for Player2 to stake
    });

    socket.on('gameStart', (data) => {
      console.log('Game starting:', data);
      setIsWaiting(false);
      setGameData(data);
      prevGameDataRef.current = data;
      soundManager.startBackgroundMusic();
    });

    socket.on('gameUpdate', (data) => {
      if (prevGameDataRef.current) {
        if (data?.ballVelocity?.x !== prevGameDataRef.current?.ballVelocity?.x) {
          soundManager.playWithErrorHandling(
            () => soundManager.playHitSound(),
            'Hit sound failed'
          );
        }

        if (data?.score && prevGameDataRef.current?.score &&
            (data.score[0] !== prevGameDataRef.current.score[0] ||
             data.score[1] !== prevGameDataRef.current.score[1])) {
          soundManager.playWithErrorHandling(
            () => soundManager.playScoreSound(),
            'Score sound failed'
          );
        }
      }

      setGameData(data);
      prevGameDataRef.current = data;
    });

    socket.on('gameOver', (result) => {
      soundManager.playWithErrorHandling(
        async () => {
          await soundManager.playGameOverSound();
          setTimeout(() => soundManager.stopAll(), 1000);
        },
        'Game over sound failed'
      );

      const isWinner = result.winner === socket.id;

      navigate('/game-over', {
        state: {
          ...result,
          isWinner,
          message: isWinner ? 'You Won!' : 'You Lost!',
          rating: result.ratings?.[socket.id],
          finalScore: result.finalScore || result.stats?.score,
          roomCode: result.roomCode,
          isStaked: result.isStaked,
          winnerSignature: result.winnerSignature,
          winnerAddress: result.winnerAddress,
          stakeAmount: result.stakeAmount,
          stakeCurrency: result.stakeCurrency,
        }
      });
    });

    socket.on('gamePaused', (data) => {
      setIsPaused(true);
      setPausedBy(data.pausedBy);
      setPausesRemaining(data.pausesRemaining);
    });

    socket.on('gameResumed', () => {
      setIsPaused(false);
      setPausedBy(null);
    });

    socket.on('playerForfeited', (data) => {
      soundManager.stopAll();
      alert(`${data.forfeitedPlayer} forfeited. ${data.winner} wins!`);
      navigate('/');
    });

    socket.on('rematchRequested', (data) => {
      setShowRematchRequest(true);
      setRematchRequester(data.from);
    });

    socket.on('rematchDeclined', () => {
      alert('Rematch declined');
      navigate('/');
    });

    socket.on('opponentLeft', () => {
      alert('Opponent left the game');
      navigate('/');
    });

    socket.on('opponentDisconnected', (data) => {
      soundManager.stopAll();
      if (data && data.winner) {
        alert(`${data.disconnectedPlayer} disconnected. ${data.winner} wins!`);
      } else {
        alert('Opponent disconnected');
      }
      navigate('/');
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
      alert('Error: ' + error.message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [username, gameMode, joinRoomCode, navigate]);

  useEffect(() => {
    isMounted.current = true;

    if (!username) {
      navigate('/');
      return;
    }

    const cleanup = setupSocket();

    return () => {
      isMounted.current = false;
      if (cleanup) cleanup();
    };
  }, [setupSocket, username, navigate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const updateCanvasSize = () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        canvas.width = window.innerWidth * 0.95;
        canvas.height = window.innerHeight * 0.65;
      } else {
        canvas.width = window.innerWidth * 0.8;
        canvas.height = window.innerHeight * 0.8;
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let animationId;
    const gameLoop = () => {
      drawGame(ctx);
      animationId = requestAnimationFrame(gameLoop);
    };
    gameLoop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [drawGame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleMouseMove, handleTouchMove]);

  // Keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);

      // Cleanup keyboard interval on unmount
      if (keyboardIntervalRef.current) {
        clearInterval(keyboardIntervalRef.current);
        keyboardIntervalRef.current = null;
      }
    };
  }, [handleKeyDown, handleKeyUp]);

  // Apply cursor-hidden class when cursor should be hidden
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isCursorHidden) {
      container.classList.add('cursor-hidden');
    } else {
      container.classList.remove('cursor-hidden');
    }
  }, [isCursorHidden]);

  // Cleanup cursor timeout on unmount
  useEffect(() => {
    return () => {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, []);

  const handleLeaveGame = useCallback(() => {
    if (window.confirm('Are you sure you want to leave? You will forfeit the game.')) {
      if (socketRef.current) {
        socketRef.current.emit('forfeitGame');
      }
      soundManager.stopAll();
      navigate('/');
    }
  }, [navigate]);

  return (
    <div className="game-container" ref={containerRef} style={{ touchAction: 'none' }}>
      <button onClick={handleLeaveGame} className="back-button" aria-label="Leave game">
        ← Back
      </button>

      {roomCode && (
        <div className="room-info">
          <span className="room-code-display">Room: {roomCode}</span>
        </div>
      )}

      <div className="player-names">
        <span>{gameData.players[0]?.name || 'Player 1'}</span>
        <span>{gameData.players[1]?.name || 'Player 2'}</span>
      </div>

      <div className="score-board">
        <span>{gameData.score[0]}</span>
        <span>{gameData.score[1]}</span>
      </div>

      {!isWaiting && (
        <>
          <div className="controls-hint" style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.6)',
            fontFamily: 'monospace',
            textAlign: 'right',
            lineHeight: '1.4'
          }}>
            <div>🎮 Controls:</div>
            <div>↑↓ Arrow Keys</div>
            <div>or Mouse</div>
          </div>
          <div className="game-controls">
            <button
              onClick={handlePauseGame}
              disabled={isPaused || pausesRemaining <= 0}
              className="control-btn pause-btn"
            >
              Pause ({pausesRemaining})
            </button>
            <button
              onClick={handleForfeitGame}
              className="control-btn forfeit-btn"
            >
              Forfeit
            </button>
          </div>
        </>
      )}

      {isPaused && (
        <div className="pause-overlay">
          <div className="pause-message">
            <h2>Game Paused</h2>
            <p>Paused by: {pausedBy}</p>
            <p>Resuming in 10 seconds...</p>
          </div>
        </div>
      )}

      {showRematchRequest && (
        <div className="rematch-overlay">
          <div className="rematch-modal">
            <h2>Rematch Request</h2>
            <p>{rematchRequester} wants a rematch!</p>
            <div className="rematch-buttons">
              <button
                onClick={() => handleRematchResponse(true)}
                className="accept-btn"
              >
                Accept
              </button>
              <button
                onClick={() => handleRematchResponse(false)}
                className="decline-btn"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlayer2StakingModal && stakingData && (
        <div className="transaction-overlay">
          <div className="transaction-modal">
            <h2>💎 Staked Match</h2>
            <p style={{ marginBottom: '20px' }}>
              Stake {stakingData.stakeAmount} <strong>{stakingData.stakeCurrency || 'CELO'}</strong> to join
            </p>

            {/* Error State */}
            {stakingErrorMessage && !isPlayer2Staking ? (
              <>
                <div style={{
                  backgroundColor: '#ff4444',
                  color: 'white',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '14px'
                }}>
                  ❌ {stakingErrorMessage}
                </div>
                <p style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
                  {isConnected
                    ? `Your wallet: ${address?.slice(0, 6)}...${address?.slice(-4)}`
                    : 'Please connect your wallet first'}
                </p>
                <div className="rematch-buttons">
                  <button
                    onClick={handlePlayer2Stake}
                    className="accept-btn"
                    disabled={!isConnected}
                  >
                    Retry Staking
                  </button>
                  <button
                    onClick={() => {
                      setShowPlayer2StakingModal(false);
                      setStakingData(null);
                      setStakingErrorMessage(null);
                      navigate('/');
                    }}
                    className="decline-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : !isPlayer2Staking ? (
              /* Initial State */
              <>
                {!isNativeToken(CURRENCIES[stakingData.stakeCurrency]?.tokenAddress) && (
                  <p style={{ fontSize: '12px', color: '#ffa500', marginBottom: '10px' }}>
                    You will need to approve the token first, then stake
                  </p>
                )}
                <p style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
                  {isConnected
                    ? `Your wallet: ${address?.slice(0, 6)}...${address?.slice(-4)}`
                    : 'Please connect your wallet first'}
                </p>
                <div className="rematch-buttons">
                  <button
                    onClick={handlePlayer2Stake}
                    className="accept-btn"
                    disabled={!isConnected}
                  >
                    Stake & Play
                  </button>
                  <button
                    onClick={() => {
                      setShowPlayer2StakingModal(false);
                      setStakingData(null);
                      setStakingErrorMessage(null);
                      navigate('/');
                    }}
                    className="decline-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              /* Loading State */
              <>
                <h3>
                  {isPlayer2StakingPending && 'Confirm Transaction in Wallet...'}
                  {isPlayer2StakingConfirming && 'Transaction Confirming...'}
                  {isApprovalPending && 'Confirm Approval in Wallet...'}
                  {isApprovalConfirming && 'Approval Confirming...'}
                </h3>
                <div className="transaction-spinner"></div>
                <p>
                  {isPlayer2StakingPending && 'Please confirm the transaction in your wallet'}
                  {isPlayer2StakingConfirming && 'Waiting for blockchain confirmation'}
                  {isApprovalPending && 'Approve the token for staking'}
                  {isApprovalConfirming && 'Waiting for approval confirmation'}
                </p>
                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '10px' }}>
                  {stakingData.stakeAmount} {stakingData.stakeCurrency || 'CELO'}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} />
    </div>
  );
};

export default MultiplayerGame;
