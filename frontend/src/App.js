import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './components/Welcome';
import MultiplayerGame from './components/MultiplayerGame';
import SpectatorView from './components/SpectatorView';
import GameOver from './components/GameOver';
import MyWins from './components/MyWins';
import GameHistory from './components/GameHistory';
import { Web3Provider } from './components/Web3Provider';
import { NotificationProvider } from './components/notifications/NotificationProvider';
import './styles/App.css';
import { STORAGE_KEY } from './constants';

function App() {
  const [gameState, setGameState] = useState({
    player1: null,
    player2: null,
    gameMode: null,
  });

  const [username, setUsername] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  const handleUsernameSet = (newUsername) => {
    setUsername(newUsername);
    localStorage.setItem(STORAGE_KEY, newUsername);
    setGameState(prev => ({
      ...prev,
      player1: {
        name: newUsername,
        rating: 800
      }
    }));
  };

  return (
    <Web3Provider>
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
              element={<MyWins />}
            />
            <Route
              path="/game-history"
              element={<GameHistory savedUsername={username} />}
            />
            </Routes>
          </div>
        </Router>
      </NotificationProvider>
    </Web3Provider>
  );
}

export default App;
