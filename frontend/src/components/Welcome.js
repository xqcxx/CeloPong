import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import '../styles/Welcome.css';
import { BACKEND_URL, SHOW_BACKEND_URL_BANNER } from '../constants';
import soundManager from '../utils/soundManager';
import { useStakeAsPlayer1, useApproveToken, useWalletBalances } from '../hooks/useContract';
import { CURRENCIES, isNativeToken } from '../config/currencies';
import { PONG_ESCROW_ADDRESS } from '../contracts/PongEscrow';
import { isMiniPay } from '../utils/minipay';
import { useLeaderboardSubscription, useBackendUrl } from '../hooks';

const Welcome = ({ setGameState, savedUsername, onUsernameSet }) => {
  const [activeGames, setActiveGames] = useState([]);
  const [showTitle, setShowTitle] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const [stakingInProgress, setStakingInProgress] = useState(false);
  const [selectedStakeAmount, setSelectedStakeAmount] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [pendingRoomCode, setPendingRoomCode] = useState(null);
  const [stakingErrorMessage, setStakingErrorMessage] = useState(null);
  const [approvalStep, setApprovalStep] = useState(false);
  const inMiniPay = isMiniPay();
  const titleRef = useRef(); // eslint-disable-line no-unused-vars
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const { leaderboard, isLoading: isLeaderboardLoading, socket } = useLeaderboardSubscription();
  const { url: backendUrl, source: backendUrlSource } = useBackendUrl();

  // Web3 hooks
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const {
    stakeAsPlayer1,
    hash: stakingTxHash,
    isPending: isStakingPending,
    isConfirming: isStakingConfirming,
    isSuccess: isStakingSuccess,
    error: stakingError
  } = useStakeAsPlayer1();

  const {
    approve: approveToken,
    isPending: isApprovalPending,
    isConfirming: isApprovalConfirming
  } = useApproveToken();

  const balances = useWalletBalances(isConnected ? address : null);

  useEffect(() => {
    if (!socket) {
      return;
    }

    socketRef.current = socket;

    const handleConnect = () => {
      console.log('Socket connected');
      socket.emit('getActiveGames');
    };

    const handleActiveGames = (games) => {
      console.log('Received active games:', games);
      setActiveGames(games);
    };

    socket.on('connect', handleConnect);
    socket.on('activeGamesList', handleActiveGames);

    const gamesInterval = setInterval(() => {
      socket.emit('getActiveGames');
    }, 3000);

    return () => {
      clearInterval(gamesInterval);
      socket.off('connect', handleConnect);
      socket.off('activeGamesList', handleActiveGames);
    };
  }, [socket]);

  // Add handler to start audio after user interaction
  const handleStartAudio = useCallback(() => {
    if (!audioStarted) {
      console.log('Starting audio from user interaction');
      setShowTitle(true);
      soundManager.playWithErrorHandling(
        () => soundManager.playIntroSound(),
        'Intro sound failed to play'
      );
      setAudioStarted(true);
    }
  }, [audioStarted]);

  // Add effect for title animation and sound
  useEffect(() => {
    // Show title animation without sound initially
    const timer = setTimeout(() => {
      setShowTitle(true);
    }, 100);

    // Setup click listener to start audio
    if (!audioStarted) {
      document.addEventListener('click', handleStartAudio, { once: true });
      document.addEventListener('touchstart', handleStartAudio, { once: true });
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleStartAudio);
      document.removeEventListener('touchstart', handleStartAudio);
    };
  }, [audioStarted, handleStartAudio]);

  // Handle successful staking transaction
  useEffect(() => {
    if (isStakingSuccess && pendingRoomCode && stakingTxHash && !approvalStep) {
      const currencyKey = selectedCurrency?.key || 'CELO';
      const currencySymbol = selectedCurrency?.symbol || 'CELO';

      fetch(`${BACKEND_URL}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: pendingRoomCode,
          player1: { name: savedUsername, rating: 800 },
          isStaked: true,
          stakeAmount: selectedStakeAmount,
          stakeCurrency: currencyKey,
          player1Address: address,
          player1TxHash: stakingTxHash,
          status: 'waiting'
        })
      }).catch(err => console.error('Failed to create game record:', err));

      setStakingInProgress(false);
      setGameState(prev => ({
        ...prev,
        player1: { name: savedUsername, rating: 800 },
        gameMode: 'create-staked',
        roomCode: pendingRoomCode,
        stakeAmount: selectedStakeAmount,
        stakeCurrency: currencyKey,
        player1Address: address,
        player1TxHash: stakingTxHash
      }));

      navigate('/game', {
        state: {
          gameMode: 'create-staked',
          roomCode: pendingRoomCode,
          stakeAmount: selectedStakeAmount,
          stakeCurrency: currencyKey,
          currencySymbol,
          player1Address: address,
          player1TxHash: stakingTxHash
        }
      });

      setPendingRoomCode(null);
      setSelectedStakeAmount(null);
      setSelectedCurrency(null);
    }
  }, [isStakingSuccess, pendingRoomCode, stakingTxHash, selectedStakeAmount, selectedCurrency, approvalStep, savedUsername, address, navigate, setGameState]);

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

  // Handle staking errors
  useEffect(() => {
    if (stakingError) {
      console.error('Staking error:', stakingError);
      setStakingErrorMessage(getErrorMessage(stakingError));
      setStakingInProgress(false);
    }
  }, [stakingError]);

  const promptUsername = (callback) => {
    if (savedUsername) {
      callback(savedUsername);
      return;
    }

    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <form method="dialog">
        <h2>Enter Your Username</h2>
        <input type="text" id="username" required minlength="2" maxlength="15">
        <div class="buttons">
          <button type="submit">Continue</button>
        </div>
      </form>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      onUsernameSet(username);
      callback(username);
      modal.remove();
    };
  };

  const handleStartGame = () => {
    promptUsername((username) => {
      setGameState(prev => ({
        ...prev,
        player1: { name: username, rating: 800 },
        gameMode: 'quick'
      }));
      navigate('/game', { state: { gameMode: 'quick' } });
    });
  };

  const handleCreateRoom = () => {
    promptUsername((username) => {
      setGameState(prev => ({
        ...prev,
        player1: { name: username, rating: 800 },
        gameMode: 'create'
      }));
      navigate('/game', { state: { gameMode: 'create' } });
    });
  };

  const handleJoinRoom = () => {
    promptUsername((username) => {
      const modal = document.createElement('dialog');
      modal.innerHTML = `
        <form method="dialog">
          <h2>Enter Room Code</h2>
          <input type="text" id="roomCode" required minlength="6" maxlength="6" placeholder="ABC123" style="text-transform: uppercase;">
          <div class="buttons">
            <button type="submit">Join Room</button>
            <button type="button" id="cancel-btn">Cancel</button>
          </div>
        </form>
      `;

      document.body.appendChild(modal);
      modal.showModal();

      document.getElementById('cancel-btn').onclick = () => {
        modal.close();
        modal.remove();
      };

      modal.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const roomCode = document.getElementById('roomCode').value.toUpperCase();
        setGameState(prev => ({
          ...prev,
          player1: { name: username, rating: 800 },
          gameMode: 'join',
          roomCode
        }));
        navigate('/game', { state: { gameMode: 'join', roomCode } });
        modal.remove();
      };
    });
  };

  const handleSpectateGame = (roomCode) => {
    promptUsername((username) => {
      navigate('/spectate', { state: { roomCode, spectatorName: username } });
    });
  };

  const doStake = async (stakeAmount, currency) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    setStakingInProgress(true);
    setSelectedStakeAmount(stakeAmount);
    setSelectedCurrency(currency);
    setPendingRoomCode(roomCode);
    setStakingErrorMessage(null);
    setApprovalStep(false);

    // For ERC-20 tokens, we need to approve first
    if (!isNativeToken(currency.tokenAddress)) {
      setApprovalStep(true);
      try {
        const amountWei = parseUnits(stakeAmount, currency.decimals);
        await approveToken(currency.tokenAddress, PONG_ESCROW_ADDRESS, amountWei);
        // Approval succeeded — now stake
        setApprovalStep(false);
        await stakeAsPlayer1(roomCode, currency, stakeAmount);
      } catch (error) {
        console.error('Error during ERC-20 stake:', error);
        setStakingInProgress(false);
        setPendingRoomCode(null);
        setSelectedStakeAmount(null);
        setSelectedCurrency(null);
      }
      return;
    }

    // Native CELO — single transaction
    try {
      await stakeAsPlayer1(roomCode, currency, stakeAmount);
    } catch (error) {
      console.error('Error initiating stake:', error);
      setStakingInProgress(false);
      setPendingRoomCode(null);
      setSelectedStakeAmount(null);
      setSelectedCurrency(null);
    }
  };

  const showStakeAmountModal = (currency) => {
    const modal = document.createElement('dialog');
    modal.className = 'stake-modal';
    const presets = currency.presets.map(v =>
      `<button type="button" class="stake-option" data-amount="${v}">${v} ${currency.symbol}</button>`
    ).join('');

    modal.innerHTML = `
      <form method="dialog">
        <h2>${currency.icon} Stake ${currency.symbol}</h2>
        <p style="margin-bottom: 20px; color: #888;">Choose how much to stake</p>
        <div class="stake-options">${presets}</div>
        <div style="margin: 20px 0; padding: 15px; background: rgba(116,113,203,0.1); border-radius: 8px;">
          <label style="display: block; margin-bottom: 10px; color: #888; font-size: 0.9rem;">
            Or enter custom amount:
          </label>
          <input type="number" id="custom-stake-input" placeholder="0.1" step="0.001" min="0.001"
            style="width: 100%; padding: 10px; background: #1a1a1a; border: 1px solid rgb(116,113,203); border-radius: 5px; color: #fff; font-size: 1rem;" />
          <div id="custom-amount-error" style="display: none; margin-top: 8px; padding: 8px; background: rgba(255,107,107,0.1); border: 1px solid #ff6b6b; border-radius: 5px; color: #ff6b6b; font-size: 0.75rem;"></div>
          <button type="button" id="use-custom-amount-btn" style="width: 100%; margin-top: 10px; padding: 10px; background: rgb(116,113,203); color: #000; border: none; border-radius: 5px; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.8rem;">
            Use Custom Amount
          </button>
        </div>
        <div class="buttons" style="margin-top: 20px;">
          <button type="button" id="cancel-stake-btn">Cancel</button>
        </div>
      </form>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#cancel-stake-btn').onclick = () => { modal.close(); modal.remove(); };

    const customInput = modal.querySelector('#custom-stake-input');
    const useCustomBtn = modal.querySelector('#use-custom-amount-btn');
    const errorDiv = modal.querySelector('#custom-amount-error');

    customInput.oninput = () => { customInput.style.borderColor = 'rgb(116,113,203)'; errorDiv.style.display = 'none'; };

    const handleStake = (stakeAmount) => {
      modal.remove();
      doStake(stakeAmount, currency);
    };

    useCustomBtn.onclick = () => {
      const amt = parseFloat(customInput.value);
      if (!amt || isNaN(amt) || amt <= 0) {
        customInput.style.borderColor = '#ff6b6b';
        errorDiv.textContent = 'Enter a valid amount';
        errorDiv.style.display = 'block';
        return;
      }
      handleStake(amt.toString());
    };

    modal.querySelectorAll('.stake-option').forEach(btn => {
      btn.onclick = () => handleStake(btn.getAttribute('data-amount'));
    });
  };

  const showCurrencyPicker = () => {
    const currencies = Object.values(CURRENCIES);
    const modal = document.createElement('dialog');
    modal.className = 'stake-modal';
    modal.innerHTML = `
      <form method="dialog">
        <h2>Choose Staking Currency</h2>
        <p style="margin-bottom: 20px; color: #888;">Your opponent must stake the same currency</p>
        <div class="stake-options" style="display: flex; flex-direction: column; gap: 10px;">
          ${currencies.map(c => {
            const bal = balances?.[c.key];
            const balStr = isConnected && bal !== null
              ? `<span style="color: #35D07F; font-size: 0.8rem;"> &mdash; ${bal} ${c.symbol}</span>`
              : '';
            return `
              <button type="button" class="stake-option currency-${c.key}" data-currency="${c.key}" style="display: flex; align-items: center; gap: 12px; padding: 16px; text-align: left;">
                <span style="font-size: 1.8rem;">${c.icon}</span>
                <div>
                  <div style="font-weight: bold; color: #fff;">${c.name}${balStr}</div>
                  <div style="font-size: 0.75rem; color: #888;">${c.symbol}</div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
        <div class="buttons" style="margin-top: 20px;">
          <button type="button" id="cancel-currency-btn">Cancel</button>
        </div>
      </form>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#cancel-currency-btn').onclick = () => { modal.close(); modal.remove(); };

    modal.querySelectorAll('.stake-option').forEach(btn => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-currency');
        modal.remove();
        showStakeAmountModal(CURRENCIES[key]);
      };
    });
  };

  const handleCreateStakedMatch = () => {
    promptUsername((username) => {
      if (!isConnected) {
        alert('Please connect your wallet to create a staked match');
        return;
      }
      showCurrencyPicker();
    });
  };

  return (
    <div className="welcome">
      {/* Wallet Connect Button — hidden in MiniPay (implicit connection) */}
      <div className="wallet-connect-container">
        {!inMiniPay && (
          <button onClick={() => open()} className="connect-wallet-btn">
            {isConnected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : 'Connect Wallet'}
          </button>
        )}
        {inMiniPay && isConnected && (
          <span className="minipay-badge">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        )}
        {savedUsername && (
          <button onClick={() => navigate('/game-history')} className="game-history-btn">
            📊 History
          </button>
        )}
        {isConnected && (
          <button onClick={() => navigate('/my-wins')} className="my-wins-btn">
            🏆 My Wins
          </button>
        )}
      </div>

      <div className={`title-container ${showTitle ? 'show' : ''}`}>
        <h1 className="game-title">PONG-IT</h1>
        <div className="title-glow"></div>
      </div>

      <div className="menu">
        <div className="game-modes">
          <button onClick={handleStartGame} className="mode-button quick-match">
            <span className="button-icon">⚡</span>
            <span className="button-text">Quick Match</span>
          </button>
          <button onClick={handleCreateRoom} className="mode-button create-room">
            <span className="button-icon">➕</span>
            <span className="button-text">Create Room</span>
          </button>
          <button onClick={handleJoinRoom} className="mode-button join-room">
            <span className="button-icon">🔗</span>
            <span className="button-text">Join Room</span>
          </button>
          <button
            onClick={handleCreateStakedMatch}
            className="mode-button staked-match"
            disabled={!isConnected}
          >
            <span className="button-icon">💎</span>
            <span className="button-text">
              {isConnected || inMiniPay ? 'Staked Match' : 'Connect Wallet First'}
            </span>
          </button>
        </div>

        {/* Transaction Status Overlay */}
        {stakingInProgress && (
          <div className="transaction-overlay">
            <div className="transaction-modal">
              {stakingErrorMessage ? (
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
                    {stakingErrorMessage}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                      onClick={() => {
                        if (pendingRoomCode && selectedStakeAmount && selectedCurrency) {
                          setStakingErrorMessage(null);
                          doStake(selectedStakeAmount, selectedCurrency);
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
                        setStakingInProgress(false);
                        setStakingErrorMessage(null);
                        setPendingRoomCode(null);
                        setSelectedStakeAmount(null);
                        setSelectedCurrency(null);
                        setApprovalStep(false);
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
                    {approvalStep && isApprovalPending && 'Step 1/2: Approve Token in Wallet...'}
                    {approvalStep && isApprovalConfirming && 'Step 1/2: Approval Confirming...'}
                    {!approvalStep && isStakingPending && 'Step ' + (selectedCurrency && !isNativeToken(selectedCurrency.tokenAddress) ? '2/2' : '1/1') + ': Confirm Stake in Wallet...'}
                    {!approvalStep && isStakingConfirming && 'Stake Confirming...'}
                  </h3>
                  <div className="transaction-spinner"></div>
                  <p>
                    {approvalStep && isApprovalPending && 'Approve the contract to use your ' + (selectedCurrency?.symbol || '')}
                    {approvalStep && isApprovalConfirming && 'Waiting for approval confirmation...'}
                    {!approvalStep && isStakingPending && 'Confirm the stake transaction in your wallet'}
                    {!approvalStep && isStakingConfirming && 'Waiting for blockchain confirmation...'}
                  </p>
                  {selectedCurrency && (
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '10px' }}>
                      Staking {selectedStakeAmount} {selectedCurrency.symbol} {selectedCurrency.icon}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="active-games">
          <h2>Live Games ({activeGames.length})</h2>
          <div className="games-list">
            {activeGames.length > 0 ? (
              activeGames.map((game) => (
                <div key={game.roomCode} className="game-item" onClick={() => handleSpectateGame(game.roomCode)}>
                  <div className="game-info">
                    <span className="game-players">{game.players.join(' vs ')}</span>
                    <span className="game-code">Room: {game.roomCode}</span>
                  </div>
                  <div className="game-stats">
                    <span className="spectator-count">👁 {game.spectatorCount}</span>
                    <span className="game-status">{game.status === 'playing' ? '🎮' : '⏳'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-games">No live games at the moment</div>
            )}
          </div>
        </div>

        {SHOW_BACKEND_URL_BANNER && (
          // Developer helper: quickly see which backend URL is active
          <div className="backend-url-banner" data-testid="backend-url-banner">
            Backend: <span>{backendUrl}</span> <em>({backendUrlSource})</em>
          </div>
        )}

        <div className="instructions">
          <h2>How to Play</h2>
          <p>Move your paddle to hit the ball past your opponent!</p>
          <p>Use UP/DOWN arrow keys to move your paddle</p>
          <p>First to 5 points wins!</p>
        </div>
        
        <div className="rankings">
          <h2>Top Players</h2>
          <div className="rankings-list">
            {leaderboard.length > 0 ? (
              leaderboard.map((player, index) => (
                <div key={player.name} className="ranking-item">
                  <span className="rank">{index + 1}</span>
                  <span className="name">{player.name}</span>
                  <span className="rating">{player.rating}</span>
                  <span className="stats">{player.wins || 0}W/{player.losses || 0}L</span>
                </div>
              ))
            ) : (
              <div className="no-rankings">
                {isLeaderboardLoading ? 'Fetching top players...' : 'No players ranked yet'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome; 
