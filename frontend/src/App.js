import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import Welcome from './components/Welcome';
import MultiplayerGame from './components/MultiplayerGame';
import SpectatorView from './components/SpectatorView';
import GameOver from './components/GameOver';
import GameHistory from './components/GameHistory';
import { Web3Provider } from './components/Web3Provider';
import { NotificationProvider } from './components/notifications/NotificationProvider';
import './styles/App.css';
import { BACKEND_URL, LOBBY_ROUTE, STORAGE_KEY } from './constants';

function AppContent() {
  const { address, isConnected } = useAccount();
  const [gameState, setGameState] = useState({
    player1: null,
    player2: null,
    gameMode: null,
  });

  const [username, setUsername] = useState(null);

  const handleUsernameSet = (newUsername) => {
    setUsername(newUsername);
    if (address && newUsername) {
      localStorage.setItem(`${STORAGE_KEY}:${address.toLowerCase()}`, newUsername);
    }
    setGameState(prev => ({
      ...prev,
      player1: newUsername ? {
        name: newUsername,
        rating: 800
      } : null
    }));
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setUsername(null);
      return;
    }

    const normalizedAddress = address.toLowerCase();
    const cachedUsername = localStorage.getItem(`${STORAGE_KEY}:${normalizedAddress}`);
    setUsername(cachedUsername);

    fetch(`${BACKEND_URL}/players/wallet/${normalizedAddress}`)
      .then(response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to load wallet username');
        return response.json();
      })
      .then(player => {
        if (player?.name) {
          setUsername(player.name);
          localStorage.setItem(`${STORAGE_KEY}:${normalizedAddress}`, player.name);
        } else {
          setUsername(null);
          localStorage.removeItem(`${STORAGE_KEY}:${normalizedAddress}`);
        }
      })
      .catch(error => {
        console.error('Unable to resolve wallet username:', error);
      });
  }, [address, isConnected]);

  return (
    <NotificationProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route
              path="/"
              element={
                <Welcome
                  setGameState={setGameState}
                  savedUsername={username}
                  onUsernameSet={handleUsernameSet}
                />
              }
            />
            <Route
              path={LOBBY_ROUTE}
              element={
                <Welcome
                  setGameState={setGameState}
                  savedUsername={username}
                  onUsernameSet={handleUsernameSet}
                />
              }
            />
            <Route
              path="/game"
              element={
                <MultiplayerGame
                  username={username}
                />
              }
            />
            <Route
              path="/spectate"
              element={<SpectatorView />}
            />
            <Route
              path="/game-over"
              element={
                <GameOver
                  savedUsername={username}
                  onPlayAgain={() => {
                    setGameState(prev => ({
                      ...prev,
                      player1: {
                        name: username,
                        rating: 800
                      }
                    }));
                  }}
                />
              }
            />
            <Route
              path="/my-wins"
              element={<Navigate to="/game-history?filter=wins" replace />}
            />
            <Route
              path="/game-history"
              element={<GameHistory savedUsername={username} />}
            />
          </Routes>
        </div>
      </Router>
    </NotificationProvider>
  );
}

function App() {
  return (
    <Web3Provider>
      <AppContent />
    </Web3Provider>
  );
}

export default App;
