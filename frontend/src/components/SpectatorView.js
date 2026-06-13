import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import '../styles/Game.css';
import { BACKEND_URL } from '../constants';
import { useNotification } from './notifications/NotificationProvider';

const SpectatorView = () => {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [gameData, setGameData] = useState({
    score: [0, 0],
    ballPos: { x: 0, y: 0 },
    paddles: {
      player1: { y: 0 },
      player2: { y: 0 }
    },
    players: []
  });
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const location = useLocation();
  const isMounted = useRef(false);

  const { roomCode, spectatorName } = location.state || {};

  const drawGame = useCallback((ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!isConnected) {
      ctx.font = '24px "Press Start 2P"';
      ctx.fillStyle = 'rgb(116,113,203)';
      ctx.textAlign = 'center';
      ctx.fillText('Connecting to game...', ctx.canvas.width / 2, ctx.canvas.height / 2);
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
  }, [gameData, isConnected]);

  const handleLeaveSpectate = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leaveSpectate');
      socketRef.current.disconnect();
    }
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    isMounted.current = true;

    if (!roomCode || !spectatorName) {
      navigate('/');
      return;
    }

    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket'],
      path: '/socket.io/'
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Spectator connected:', socket.id);
      socket.emit('spectateGame', { roomCode, spectatorName });
    });

    socket.on('spectateStart', (data) => {
      console.log('Spectating game:', data);
      setIsConnected(true);
      setGameData(data);
    });

    socket.on('gameUpdate', (data) => {
      setGameData(data);
    });

    socket.on('spectatorUpdate', (data) => {
      console.log('Spectator count:', data.count);
      setSpectatorCount(data.count);
    });

    socket.on('gameOver', (result) => {
      console.log('Game over:', result);
      notify('Game has ended!', { type: 'info' });
      navigate('/');
    });

    socket.on('error', (error) => {
      console.error('Spectator error:', error);
      notify('Error: ' + error.message, { type: 'error' });
      navigate('/');
    });

    return () => {
      isMounted.current = false;
      if (socketRef.current) {
        socketRef.current.emit('leaveSpectate');
        socketRef.current.disconnect();
      }
    };
  }, [roomCode, spectatorName, navigate, notify]);

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

  return (
    <div className="game-container spectator-mode">
      <div className="spectator-header">
        <div className="spectator-badge">
          <span>👁 SPECTATING</span>
          <span className="spectator-count-badge">{spectatorCount} watching</span>
        </div>
        <button onClick={handleLeaveSpectate} className="leave-spectate-btn">
          Leave
        </button>
      </div>

      <div className="player-names">
        <span>{gameData.players[0]?.name || 'Player 1'}</span>
        <span>{gameData.players[1]?.name || 'Player 2'}</span>
      </div>

      <div className="score-board">
        <span>{gameData.score[0]}</span>
        <span>{gameData.score[1]}</span>
      </div>

      <canvas ref={canvasRef} />
    </div>
  );
};

export default SpectatorView;
