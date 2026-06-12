'use client';
import React, { useState } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import Welcome from '@/components/Welcome';
import MultiplayerGame from '@/components/MultiplayerGame';
import SpectatorView from '@/components/SpectatorView';
import GameOver from '@/components/GameOver';
import MyWins from '@/components/MyWins';
import GameHistory from '@/components/GameHistory';
import '../styles/App.css';
import { STORAGE_KEY } from '../constants';

export default function App() {
  const [gameState, setGameState] = useState({
    player1: null as any,
    player2: null as any,
    gameMode: null as string | null,
  });

  const [username, setUsername] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || null;
    }
    return null;
  });

  const handleUsernameSet = (newUsername: string) => {
    setUsername(newUsername);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newUsername);
    }
    setGameState(prev => ({
      ...prev,
      player1: { name: newUsername, rating: 800 },
    }));
  };

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Welcome setGameState={setGameState} savedUsername={username} onUsernameSet={handleUsernameSet} />} />
        <Route path="/game" element={<MultiplayerGame username={username} />} />
        <Route path="/spectate" element={<SpectatorView />} />
        <Route path="/game-over" element={<GameOver />} />
        <Route path="/my-wins" element={<MyWins />} />
        <Route path="/game-history" element={<GameHistory savedUsername={username} />} />
      </Routes>
      </BrowserRouter>
    </div>
  );
}
