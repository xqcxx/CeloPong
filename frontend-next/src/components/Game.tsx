'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import io from 'socket.io-client';
import '../styles/Game.css';
import { BACKEND_URL, INITIAL_RATING } from '../constants';
import soundManager from '../utils/soundManager';
import { useStakeAsPlayer2 } from '../hooks/useContract';


const Game = ({ username }) => {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const modalRef = useRef(null);
  const [isWaiting, setIsWaiting] = useState(true);
  const [gameData, setGameData] = useState({
    score: [0, 0],
    ballPos: { x: 0, y: 0 },
    ballSpeed: 5,
    paddles: {
      player1: { y: 0 },
      player2: { y: 0 }
    },
    players: []
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const isMounted = useRef(false);

  const prevGameDataRef = useRef(null);

  const containerRef = useRef(null);

  const [isGenomeMusicActive, setIsGenomeMusicActive] = useState(false);
  const [genomeInput, setGenomeInput] = useState('');

  const [audioStarted, setAudioStarted] = useState(false);

  // Web3 and staking state
  const { address, isConnected } = useAccount();
  const [showStakingModal, setShowStakingModal] = useState(false);
  const [stakingData, setStakingData] = useState(null); // { roomCode, stakeAmount, player1Address }
  const [stakingInProgress, setStakingInProgress] = useState(false);
  const [waitingForPlayer2Stake, setWaitingForPlayer2Stake] = useState(false);
  const [player2StakingErrorMessage, setPlayer2StakingErrorMessage] = useState(null);

  // Player2 staking hook
  const {
    stakeAsPlayer2,
    hash: player2TxHash,
    isPending: isPlayer2Staking,
    isConfirming: isPlayer2Confirming,
    isSuccess: isPlayer2StakingSuccess,
    error: player2StakingError
  } = useStakeAsPlayer2();

  const drawGame = useCallback((ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    if (isWaiting) {
      ctx.font = '24px "Press Start 2P"';
      ctx.fillStyle = 'rgb(116,113,203)';
      ctx.textAlign = 'center';
      const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
      ctx.fillText(`Waiting for opponent${dots}`, ctx.canvas.width / 2, ctx.canvas.height / 2);
      return;
    }
    
    const { width, height } = ctx.canvas;
    ctx.imageSmoothingEnabled = true;

    // Draw paddles (keeping the original color)
    ctx.fillStyle = 'rgb(116,113,203)';
    const paddleWidth = width * 0.02;
    const paddleHeight = height * 0.2;
    
    Object.values(gameData.paddles).forEach((paddle, index) => {
      const x = index === 0 ? paddleWidth : width - paddleWidth * 2;
      const y = (paddle.y + 1) * height / 2 - paddleHeight / 2;
      ctx.fillRect(x, y, paddleWidth, paddleHeight);
    });

    // Draw ball with new color
    ctx.fillStyle = 'rgb(253,208,64)';
    const ballSize = width * 0.02;
    const ballX = (gameData.ballPos.x + 1) * width / 2 - ballSize / 2;
    const ballY = (gameData.ballPos.y + 1) * height / 2 - ballSize / 2;
    ctx.beginPath();
    ctx.arc(ballX + ballSize/2, ballY + ballSize/2, ballSize/2, 0, Math.PI * 2);
    ctx.fill();
  }, [gameData, isWaiting]);

  // Handle keyboard input
  const handleKeyPress = useCallback((e) => {
    if (!socketRef.current || isWaiting) return;

    // Add more detailed debug logging
    console.log('Key pressed:', e.key);
    console.log('Current socket ID:', socketRef.current.id);
    console.log('Available paddles:', Object.keys(gameData.paddles));
    console.log('Players:', gameData.players);
    console.log('Game data:', gameData);

    const moveAmount = 0.05;
    let newPosition = null;

    // Find which player we are (0 or 1)
    const playerIndex = gameData.players.findIndex(p => p.socketId === socketRef.current.id);
    console.log('Player index:', playerIndex);
    console.log('Socket ID to match:', socketRef.current.id);
    
    if (playerIndex === -1) {
      console.error('Player not found in game data');
      return;
    }

    const paddleKey = `player${playerIndex + 1}`;
    const currentPosition = gameData.paddles[paddleKey].y;
    console.log('Current paddle position:', currentPosition);

    switch (e.key) {
      case 'w':
      case 'ArrowUp':
        newPosition = Math.max(currentPosition - moveAmount, -0.95);
        console.log('Moving up to:', newPosition);
        break;
      case 's':
      case 'ArrowDown':
        newPosition = Math.min(currentPosition + moveAmount, 0.95);
        console.log('Moving down to:', newPosition);
        break;
      default:
        return;
    }

    if (newPosition !== null) {
      console.log('Emitting paddle move:', { position: newPosition });
      socketRef.current.emit('paddleMove', { position: newPosition });
    }
  }, [gameData, isWaiting]);

  // Add mouse movement handler
  const handleMouseMove = useCallback((e) => {
    if (!socketRef.current || isWaiting) return;

    const container = containerRef.current;
    if (!container) return;

    // Get container bounds
    const bounds = container.getBoundingClientRect();
    
    // Calculate relative Y position (-1 to 1)
    const relativeY = ((e.clientY - bounds.top) / bounds.height) * 2 - 1;
    
    // Clamp the value between -1 and 1
    const clampedY = Math.max(-1, Math.min(1, relativeY));
    
    // Emit paddle movement with 'position' instead of 'y'
    socketRef.current.emit('paddleMove', { position: clampedY });
  }, [isWaiting]);

  // Add touch movement handler
  const handleTouchMove = useCallback((e) => {
    if (!socketRef.current || isWaiting) return;
    
    // Prevent scrolling when playing the game
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    // Get container bounds
    const bounds = container.getBoundingClientRect();
    
    // Use the first touch point
    if (e.touches && e.touches.length > 0) {
      // Calculate relative Y position (-1 to 1)
      const touchY = e.touches[0].clientY;
      const relativeY = ((touchY - bounds.top) / bounds.height) * 2 - 1;
      
      // Clamp the value between -1 and 1
      const clampedY = Math.max(-1, Math.min(1, relativeY));
      
      // Emit paddle movement
      socketRef.current.emit('paddleMove', { position: clampedY });
    }
  }, [isWaiting]);

  const testBackendConnection = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      const data = await response.json();
      console.log('Backend health check:', data);
      return true;
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  };

  const cleanupSocket = useCallback(() => {
    if (!isMounted.current) return;

    console.log('Cleaning up socket connection');
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnecting(false);
    setConnectionStatus('disconnected');
    setConnectionAttempts(0);
    setIsWaiting(false);
    setGameData(prevData => ({
      ...prevData,
      score: [0, 0],
      players: [],
      paddles: {
        player1: { y: 0 },
        player2: { y: 0 }
      }
    }));
  }, []);

  const setupSocket = useCallback(async (username) => {
    if (!isMounted.current) return;
    
    if (isConnecting) {
      console.log('Already connecting');
      return;
    }

    // Clean up any existing socket first
    cleanupSocket();

    console.log('Setting up socket for username:', username);

    const newSocket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket'],
      path: '/socket.io/',
      reconnection: false,
      timeout: 45000,
      autoConnect: false,
      forceNew: true,
      query: { username }
    });

    // Store socket reference immediately
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      if (!isMounted.current) return;
      console.log('Socket connected with ID:', newSocket.id, 'Username:', username);

      soundManager.playWithErrorHandling(
        () => soundManager.playLoadSound(),
        'Connection sound failed to play'
      );

      const playerData = {
        name: username,
        rating: INITIAL_RATING,
        position: { y: 0 },
        socketId: newSocket.id
      };

      // Handle different game modes from location.state
      const gameMode = location.state?.gameMode;
      const roomCode = location.state?.roomCode;

      console.log('Game mode:', gameMode, 'Room code:', roomCode);

      if (gameMode === 'create' || gameMode === 'create-staked') {
        // Create a room (for staked matches, we already have the room code)
        console.log('Creating room...', roomCode ? `with code ${roomCode}` : '');
        newSocket.emit('createRoom', playerData, roomCode);
      } else if (gameMode === 'join' && roomCode) {
        // Join an existing room
        console.log('Joining room:', roomCode);
        newSocket.emit('joinRoom', { roomCode, player: playerData });
      } else {
        // Quick match - find random opponent
        console.log('Finding random match...');
        newSocket.emit('findRandomMatch', playerData);
      }
    });

    newSocket.on('connect_error', (error) => {
      if (!isMounted.current) return;
      console.error('Connection error:', error);
      setConnectionStatus('error');
      setIsConnecting(false);
      if (socketRef.current === newSocket) {
        cleanupSocket();
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setConnectionStatus('disconnected');
      setIsConnecting(false);
    });

    newSocket.on('waiting', () => {
      console.log('Received waiting event');
      setIsWaiting(true);
    });

    newSocket.on('gameStart', (data) => {
      console.log('Received gameStart event:', data);
      setIsWaiting(false);
      setGameData(data);
      prevGameDataRef.current = data;
      
      // Start background music only if genome music is not active
      if (!isGenomeMusicActive) {
        soundManager.startBackgroundMusic();
      }
    });

    newSocket.on('gameUpdate', (data) => {
      if (!prevGameDataRef.current) {
        prevGameDataRef.current = data;
        setGameData(data);
        return;
      }

      try {
        // Check if ball hit a paddle by comparing with previous position
        if (data?.ballVelocity?.x !== prevGameDataRef.current?.ballVelocity?.x) {
          soundManager.playWithErrorHandling(
            () => soundManager.playHitSound(),
            'Hit sound failed to play'
          );
        }
        
        // Check if score changed
        if (data?.score && prevGameDataRef.current?.score &&
            (data.score[0] !== prevGameDataRef.current.score[0] || 
             data.score[1] !== prevGameDataRef.current.score[1])) {
          soundManager.playWithErrorHandling(
            () => soundManager.playScoreSound(),
            'Score sound failed to play'
          );
        }
      } catch (error) {
        console.error('Error processing game update:', error);
      }
      
      setGameData(data);
      prevGameDataRef.current = data;
    });

    newSocket.on('gameOver', (result) => {
      soundManager.playWithErrorHandling(
        async () => {
          await soundManager.playGameOverSound();
          setTimeout(() => soundManager.stopAll(), 1000);
        },
        'Game over sound failed to play'
      );
      
      if (!isMounted.current) return;
      
      // Clear the previous game data
      prevGameDataRef.current = null;
      
      console.log('Game over:', result);
      
      const isWinner = result.winner === socketRef.current?.id;
      
      navigate('/game-over', { 
        state: {
          ...result,
          isWinner,
          message: isWinner ? 'You Won!' : 'You Lost!',
          rating: result.ratings?.[socketRef.current?.id],
          finalScore: result.finalScore || result.stats?.score
        }
      });
    });

    // Staked match event handlers
    newSocket.on('stakedMatchJoined', (data) => {
      console.log('Joined staked match:', data);
      setStakingData({
        roomCode: data.roomCode,
        stakeAmount: data.stakeAmount,
        player1Address: data.player1Address
      });
      setShowStakingModal(true);
    });

    newSocket.on('waitingForPlayer2Stake', (data) => {
      console.log('Waiting for Player 2 to stake:', data);
      setWaitingForPlayer2Stake(true);
      setIsWaiting(true);
    });

    newSocket.on('roomCreated', (data) => {
      console.log('Room created:', data);
      // Room created, waiting for Player2
      setIsWaiting(true);
    });

    newSocket.on('roomReady', (data) => {
      console.log('Room ready after Player 2 staking:', data);
      setWaitingForPlayer2Stake(false);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error.message || error);
      alert('Error: ' + (error.message || error));
    });

    // Connect after setting up handlers
    try {
      await newSocket.connect();
    } catch (error) {
      if (!isMounted.current) return;
      console.error('Connection failed:', error);
      setConnectionStatus('error');
      setIsConnecting(false);
      if (socketRef.current === newSocket) {
        cleanupSocket();
      }
    }

    return () => {
      if (isMounted.current && socketRef.current === newSocket) {
        cleanupSocket();
      }
    };
  }, [cleanupSocket, isConnecting, navigate, isGenomeMusicActive]);

  // Setup keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Setup game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;

    let animationId;
    const gameLoop = () => {
      drawGame(ctx);
      animationId = requestAnimationFrame(gameLoop);
    };
    gameLoop();

    return () => cancelAnimationFrame(animationId);
  }, [drawGame]);

  // Add mouse movement listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  // Add touch event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add mouse and touch event listeners
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleMouseMove, handleTouchMove]);

  // Update the main useEffect
  useEffect(() => {
    isMounted.current = true;
    
    const initGame = async () => {
      if (!socketRef.current && !isConnecting) {
        // Just use the provided username from props - don't show a modal
        if (username) {
          console.log('Using provided username:', username);
          await setupSocket(username);
        } else {
          // If no username provided, we'll use a guest name
          const guestName = 'Guest_' + Math.floor(Math.random() * 1000);
          console.log('No username provided, using guest name:', guestName);
          await setupSocket(guestName);
        }
      }
    };

    initGame();

    return () => {
      isMounted.current = false;
      if (modalRef.current) {
        modalRef.current.remove();
        modalRef.current = null;
      }
      prevGameDataRef.current = null; // Clear the previous game data
      cleanupSocket();
    };
  }, [setupSocket, cleanupSocket, isConnecting, username]);

  // Add sound initialization with genome support
  useEffect(() => {
    // Only start default background music if genome music is not active
    if (!isGenomeMusicActive) {
      soundManager.playWithErrorHandling(
        () => soundManager.startBackgroundMusic(),
        'Background music failed to start'
      );
    }
    
    return () => {
      try {
        soundManager.stopAll();
      } catch (error) {
        console.warn('Failed to stop sounds:', error);
      }
    };
  }, [isGenomeMusicActive]);

  // Handle successful Player2 staking
  useEffect(() => {
    if (isPlayer2StakingSuccess && player2TxHash && stakingData) {
      console.log('Player 2 staking successful! Updating game record...');

      // Update game record with Player 2 data
      fetch(`${BACKEND_URL}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: stakingData.roomCode,
          player2: { name: username, rating: 800 },
          player2Address: address,
          player2TxHash: player2TxHash,
          status: 'playing'
        })
      })
        .then(res => res.json())
        .then(data => {
          console.log('✅ Player 2 stake recorded in database:', data);

          // Notify backend that Player 2 has staked
          if (socketRef.current) {
            socketRef.current.emit('player2StakeCompleted', {
              roomCode: stakingData.roomCode
            });
          }

          // Close staking modal
          setShowStakingModal(false);
          setStakingInProgress(false);
          setStakingData(null);
        })
        .catch(err => {
          console.error('❌ Failed to update game record:', err);
          alert('Failed to record your stake. Please contact support.');
        });
    }
  }, [isPlayer2StakingSuccess, player2TxHash, stakingData, address, username]);

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

  // Handle Player2 staking errors
  useEffect(() => {
    if (player2StakingError) {
      console.error('Player 2 staking error:', player2StakingError);
      setPlayer2StakingErrorMessage(getErrorMessage(player2StakingError));
      setStakingInProgress(false);
    }
  }, [player2StakingError]);

  // Add this inside your existing useEffect for game setup
  useEffect(() => {
    // Add 'playing' class to body when game starts
    if (!isWaiting) {
      document.body.classList.add('playing');
    }

    return () => {
      // Remove 'playing' class when component unmounts
      document.body.classList.remove('playing');
    };
  }, [isWaiting]);

  // Function to handle genome music toggle
  const handleGenomeMusicToggle = () => {
    const genomeModal = document.createElement('dialog');
    genomeModal.innerHTML = `
      <form method="dialog">
        <h2>Enter Music Genome</h2>
        <p>Enter a string that will be used to generate music</p>
        <input type="text" id="genome-input" placeholder="Enter genome string" required minlength="4" value="${genomeInput || ''}">
        <div class="buttons">
          <button type="submit">Generate Music</button>
          <button type="button" id="cancel-btn">Cancel</button>
        </div>
      </form>
    `;
    
    document.body.appendChild(genomeModal);
    genomeModal.showModal();
    
    // Handle cancel button
    document.getElementById('cancel-btn').onclick = () => {
      genomeModal.close();
      genomeModal.remove();
    };
    
    genomeModal.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const genome = document.getElementById('genome-input').value;
      if (genome) {
        console.log('Starting genome music with:', genome);
        setGenomeInput(genome);
        setIsGenomeMusicActive(true);
        
        // Use a try-catch block to handle any errors
        try {
          soundManager.stopAll();
          
          // Add a small delay before starting new audio
          setTimeout(() => {
            try {
              soundManager.startGenomeAudio(genome);
              console.log('Genome music started successfully');
            } catch (error) {
              console.error('Error starting genome music:', error);
            }
          }, 100);
        } catch (error) {
          console.error('Error in genome music toggle:', error);
        }
      }
      genomeModal.remove();
    };
  };
  
  // Function to reset to default music
  const resetToDefaultMusic = () => {
    try {
      console.log('Resetting to default music');
      setIsGenomeMusicActive(false);
      soundManager.stopAll();
      
      // Add a small delay before starting new audio
      setTimeout(() => {
        try {
          soundManager.startBackgroundMusic();
          console.log('Default music started successfully');
        } catch (error) {
          console.error('Error starting default music:', error);
        }
      }, 100);
    } catch (error) {
      console.error('Error in reset to default music:', error);
    }
  };

  // Add a click handler to start audio after user interaction
  const handleStartAudio = useCallback(() => {
    if (!audioStarted) {
      console.log('Starting audio from user interaction');
      soundManager.stopAll();
      soundManager.startSimpleGenomeAudio();
      setAudioStarted(true);
    }
  }, [audioStarted]);

  // Add effect to set up click listener
  useEffect(() => {
    if (!audioStarted) {
      document.addEventListener('click', handleStartAudio, { once: true });
      document.addEventListener('touchstart', handleStartAudio, { once: true });
      
      // Also try to start automatically
      const timer = setTimeout(() => {
        console.log('Attempting automatic audio start');
        handleStartAudio();
      }, 1000);
      
      return () => {
        document.removeEventListener('click', handleStartAudio);
        document.removeEventListener('touchstart', handleStartAudio);
        clearTimeout(timer);
      };
    }
  }, [audioStarted, handleStartAudio]);

  return (
    <div className="game-container" ref={containerRef} style={{ touchAction: 'none' }}>
      <div className="player-names">
        <span>{gameData.players[0]?.name || 'Player 1'}</span>
        <span>{gameData.players[1]?.name || 'Player 2'}</span>
      </div>
      <div className="score-board">
        <span>{gameData.score[0]}</span>
        <span>{gameData.score[1]}</span>
      </div>
      <canvas ref={canvasRef} />
      
      {/* Music controls with auto cursor */}
      <div className="music-controls-container" style={{ cursor: 'auto' }}>
        <div className="music-controls">
          {isGenomeMusicActive ? (
            <button onClick={resetToDefaultMusic} className="music-button">
              Reset to Default Music
            </button>
          ) : (
            <button onClick={handleGenomeMusicToggle} className="music-button">
              Use Genome Music
            </button>
          )}
        </div>
      </div>

      {/* Add a visible button to start audio if not started */}
      {!audioStarted && (
        <div className="audio-start-container" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          padding: '20px',
          borderRadius: '10px',
          border: '2px solid rgb(116,113,203)',
          textAlign: 'center'
        }}>
          <button onClick={handleStartAudio} style={{
            fontFamily: 'Press Start 2P, monospace',
            fontSize: '1rem',
            padding: '15px 30px',
            background: 'rgb(116,113,203)',
            color: '#000',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}>
            Start Game Audio
          </button>
        </div>
      )}

      {/* Player2 Staking Modal */}
      {showStakingModal && stakingData && (
        <div className="transaction-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div className="transaction-modal" style={{
            background: '#1a1a1a',
            padding: '40px',
            borderRadius: '15px',
            border: '3px solid rgb(116,113,203)',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <h2 style={{
              fontFamily: 'Press Start 2P, monospace',
              fontSize: '1.5rem',
              color: 'rgb(253,208,64)',
              marginBottom: '20px'
            }}>
              Staked Match
            </h2>

            {!stakingInProgress ? (
              <>
                <p style={{
                  fontFamily: 'Press Start 2P, monospace',
                  fontSize: '0.9rem',
                  color: '#fff',
                  marginBottom: '20px',
                  lineHeight: '1.8'
                }}>
                  This is a staked match!<br/>
                  You must stake {stakingData.stakeAmount} ETH<br/>
                  to play against your opponent.
                </p>

                <div style={{
                  background: 'rgba(116,113,203,0.2)',
                  padding: '15px',
                  borderRadius: '10px',
                  marginBottom: '25px'
                }}>
                  <p style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: '#888',
                    marginBottom: '5px'
                  }}>
                    Player 1 Address:
                  </p>
                  <p style={{
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    color: 'rgb(116,113,203)',
                    wordBreak: 'break-all'
                  }}>
                    {stakingData.player1Address}
                  </p>
                </div>

                {!isConnected ? (
                  <p style={{
                    color: 'rgb(253,208,64)',
                    fontFamily: 'Press Start 2P, monospace',
                    fontSize: '0.8rem',
                    marginBottom: '20px'
                  }}>
                    Please connect your wallet first
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                    <button
                      onClick={async () => {
                        setStakingInProgress(true);
                        setPlayer2StakingErrorMessage(null); // Clear any previous errors
                        try {
                          await stakeAsPlayer2(stakingData.roomCode, stakingData.stakeAmount);
                        } catch (error) {
                          console.error('Error initiating stake:', error);
                          setStakingInProgress(false);
                        }
                      }}
                      style={{
                        fontFamily: 'Press Start 2P, monospace',
                        fontSize: '0.9rem',
                        padding: '15px 25px',
                        background: 'rgb(116,113,203)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Stake {stakingData.stakeAmount} ETH
                    </button>

                    <button
                      onClick={() => {
                        setShowStakingModal(false);
                        setStakingData(null);
                        navigate('/');
                      }}
                      style={{
                        fontFamily: 'Press Start 2P, monospace',
                        fontSize: '0.9rem',
                        padding: '15px 25px',
                        background: '#444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            ) : player2StakingErrorMessage ? (
              <>
                <h3 style={{
                  fontFamily: 'Press Start 2P, monospace',
                  fontSize: '1rem',
                  color: '#ff6b6b',
                  marginBottom: '20px'
                }}>
                  Transaction Failed
                </h3>
                <div style={{
                  background: 'rgba(255, 107, 107, 0.1)',
                  border: '1px solid #ff6b6b',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '20px',
                  color: '#ff6b6b',
                  fontSize: '0.8rem',
                  fontFamily: 'Press Start 2P, monospace',
                  lineHeight: '1.5'
                }}>
                  {player2StakingErrorMessage}
                </div>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                  <button
                    onClick={async () => {
                      setPlayer2StakingErrorMessage(null);
                      try {
                        await stakeAsPlayer2(stakingData.roomCode, stakingData.stakeAmount);
                      } catch (error) {
                        console.error('Retry error:', error);
                      }
                    }}
                    style={{
                      fontFamily: 'Press Start 2P, monospace',
                      fontSize: '0.8rem',
                      padding: '12px 24px',
                      background: 'rgb(116,113,203)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => {
                      setShowStakingModal(false);
                      setStakingData(null);
                      setStakingInProgress(false);
                      setPlayer2StakingErrorMessage(null);
                      navigate('/');
                    }}
                    style={{
                      fontFamily: 'Press Start 2P, monospace',
                      fontSize: '0.8rem',
                      padding: '12px 24px',
                      background: '#444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{
                  fontFamily: 'Press Start 2P, monospace',
                  fontSize: '1rem',
                  color: '#fff',
                  marginBottom: '20px'
                }}>
                  {isPlayer2Staking && 'Confirm Transaction...'}
                  {isPlayer2Confirming && 'Transaction Confirming...'}
                </h3>
                <div className="transaction-spinner" style={{
                  border: '4px solid rgba(116,113,203,0.3)',
                  borderTop: '4px solid rgb(116,113,203)',
                  borderRadius: '50%',
                  width: '60px',
                  height: '60px',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 20px'
                }}></div>
                <p style={{
                  fontFamily: 'Press Start 2P, monospace',
                  fontSize: '0.8rem',
                  color: '#888'
                }}>
                  {isPlayer2Staking && 'Confirm the transaction in your wallet'}
                  {isPlayer2Confirming && 'Waiting for blockchain confirmation'}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Waiting for Player2 Stake (for Player1) */}
      {waitingForPlayer2Stake && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(116,113,203,0.9)',
          padding: '15px 30px',
          borderRadius: '10px',
          border: '2px solid rgb(253,208,64)',
          zIndex: 1500,
          fontFamily: 'Press Start 2P, monospace',
          fontSize: '0.9rem',
          color: '#000'
        }}>
          Waiting for Player 2 to stake...
        </div>
      )}
    </div>
  );
};

export default Game; 
